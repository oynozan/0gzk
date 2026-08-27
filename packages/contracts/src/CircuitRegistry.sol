// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CircuitRegistry
/// @notice On-chain index for ZK circuits hosted on 0G Storage.
///
///         A circuit is identified by a globally-unique lowercase `name`. Each
///         name has an `owner` (initially the address that called
///         `createCircuit`) authorised to publish new versions and transfer
///         ownership. Each (`name`, `version`) tuple maps to an immutable
///         record describing where the circuit bundle lives (`rootHash` on 0G
///         Storage), what it cryptographically commits to (`vkeyHash` =
///         keccak256 of the canonical verification_key.json), and where its
///         on-chain Groth16 verifier is deployed (`verifier`, settable
///         post-publish).
///
///         The registry never holds funds and never performs signature
///         verification — it is purely an index. Consumers should:
///           1. resolve `(name, version)` -> `Version`
///           2. fetch the bundle at `rootHash` from 0G Storage
///           3. confirm the bundle's verification_key.json hashes to `vkeyHash`
///           4. (optional) call `IGroth16Verifier(verifier).verifyProof(...)`
contract CircuitRegistry {
    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    struct Version {
        bytes32 rootHash;
        bytes32 vkeyHash;
        address verifier;
        address publisher;
        uint64 publishedAt;
        string metadataURI;
    }

    struct Circuit {
        bool exists;
        address owner;
        string[] versionList;
        mapping(string => Version) versions;
    }

    struct CircuitSummary {
        string name;
        address owner;
        uint256 versionCount;
        string latestVersion;
    }

    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    event CircuitCreated(string indexed nameHash, string name, address indexed owner);
    event VersionPublished(
        string indexed nameHash,
        string name,
        string version,
        bytes32 rootHash,
        bytes32 vkeyHash,
        address verifier,
        address indexed publisher
    );
    event VerifierSet(string indexed nameHash, string name, string version, address verifier);
    event OwnerTransferred(string indexed nameHash, string name, address indexed from, address indexed to);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/

    error InvalidName(string name);
    error InvalidVersion(string version);
    error NameAlreadyClaimed(string name);
    error CircuitNotFound(string name);
    error VersionNotFound(string name, string version);
    error VersionAlreadyPublished(string name, string version);
    error NotOwner(string name, address caller);
    error ZeroRootHash();
    error ZeroVkeyHash();
    error ZeroAddress();

    /*//////////////////////////////////////////////////////////////
                                STATE
    //////////////////////////////////////////////////////////////*/

    mapping(string => Circuit) private _circuits;
    string[] private _names;

    /*//////////////////////////////////////////////////////////////
                          CIRCUIT REGISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Claim a circuit name. First-come-first-served. Names must match
    ///         `^[a-z0-9_-]{2,32}$` to ensure CLI/URL friendliness.
    function createCircuit(string calldata name) external {
        _validateName(name);
        Circuit storage c = _circuits[name];
        if (c.exists) revert NameAlreadyClaimed(name);

        c.exists = true;
        c.owner = msg.sender;
        _names.push(name);

        emit CircuitCreated(name, name, msg.sender);
    }

    /// @notice Publish a new immutable version under an owned circuit.
    /// @dev `verifier` may be address(0) at publish time and patched later via
    ///      `setVerifier`. All other fields are frozen forever once written.
    function publishVersion(
        string calldata name,
        string calldata version,
        bytes32 rootHash,
        bytes32 vkeyHash,
        address verifier,
        string calldata metadataURI
    ) external {
        _validateVersion(version);
        Circuit storage c = _circuit(name);
        if (c.owner != msg.sender) revert NotOwner(name, msg.sender);
        if (rootHash == bytes32(0)) revert ZeroRootHash();
        if (vkeyHash == bytes32(0)) revert ZeroVkeyHash();
        if (c.versions[version].rootHash != bytes32(0)) {
            revert VersionAlreadyPublished(name, version);
        }

        c.versions[version] = Version({
            rootHash: rootHash,
            vkeyHash: vkeyHash,
            verifier: verifier,
            publisher: msg.sender,
            publishedAt: uint64(block.timestamp),
            metadataURI: metadataURI
        });
        c.versionList.push(version);

        emit VersionPublished(name, name, version, rootHash, vkeyHash, verifier, msg.sender);
    }

    /// @notice Attach (or replace) the on-chain Groth16 verifier for an
    ///         already-published version. Only the circuit owner can call.
    function setVerifier(string calldata name, string calldata version, address verifier) external {
        Circuit storage c = _circuit(name);
        if (c.owner != msg.sender) revert NotOwner(name, msg.sender);
        Version storage v = _version(c, name, version);
        if (verifier == address(0)) revert ZeroAddress();
        v.verifier = verifier;
        emit VerifierSet(name, name, version, verifier);
    }

    /// @notice Transfer ownership of a circuit's namespace.
    function transferOwner(string calldata name, address newOwner) external {
        Circuit storage c = _circuit(name);
        if (c.owner != msg.sender) revert NotOwner(name, msg.sender);
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = c.owner;
        c.owner = newOwner;
        emit OwnerTransferred(name, name, prev, newOwner);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Total number of circuits ever registered.
    function circuitCount() external view returns (uint256) {
        return _names.length;
    }

    /// @notice Returns true iff a circuit name has been claimed.
    function exists(string calldata name) external view returns (bool) {
        return _circuits[name].exists;
    }

    /// @notice Owner address for a registered circuit name.
    function ownerOf(string calldata name) external view returns (address) {
        return _circuit(name).owner;
    }

    /// @notice Full record for a specific (name, version).
    function getVersion(string calldata name, string calldata version)
        external
        view
        returns (Version memory)
    {
        Circuit storage c = _circuit(name);
        Version storage v = _version(c, name, version);
        return v;
    }

    /// @notice Returns the most recently published version string and its
    ///         record. Reverts if no versions have been published yet.
    function getLatest(string calldata name)
        external
        view
        returns (string memory version, Version memory record)
    {
        Circuit storage c = _circuit(name);
        uint256 n = c.versionList.length;
        if (n == 0) revert VersionNotFound(name, "");
        version = c.versionList[n - 1];
        record = c.versions[version];
    }

    /// @notice Enumerate all version strings registered under a circuit name,
    ///         in publication order (oldest first).
    function listVersions(string calldata name) external view returns (string[] memory) {
        return _circuit(name).versionList;
    }

    /// @notice Paginated browse of every registered circuit. `offset` and
    ///         `limit` clamp safely; passing `limit=0` returns nothing.
    function listCircuits(uint256 offset, uint256 limit)
        external
        view
        returns (CircuitSummary[] memory page)
    {
        uint256 total = _names.length;
        if (offset >= total || limit == 0) {
            return new CircuitSummary[](0);
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new CircuitSummary[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            string memory n = _names[i];
            Circuit storage c = _circuits[n];
            uint256 vc = c.versionList.length;
            string memory latest = vc == 0 ? "" : c.versionList[vc - 1];
            page[i - offset] = CircuitSummary({
                name: n,
                owner: c.owner,
                versionCount: vc,
                latestVersion: latest
            });
        }
    }

    /*//////////////////////////////////////////////////////////////
                              INTERNAL
    //////////////////////////////////////////////////////////////*/

    function _circuit(string calldata name) private view returns (Circuit storage c) {
        c = _circuits[name];
        if (!c.exists) revert CircuitNotFound(name);
    }

    function _version(Circuit storage c, string calldata name, string calldata version)
        private
        view
        returns (Version storage v)
    {
        v = c.versions[version];
        if (v.rootHash == bytes32(0)) revert VersionNotFound(name, version);
    }

    /// @dev Names are restricted to `^[a-z0-9_-]{2,32}$`. Keeping the alphabet
    ///      narrow means CLIs and URLs can carry names verbatim, and rules out
    ///      both upper-case shadow names and unicode lookalikes.
    function _validateName(string calldata name) private pure {
        bytes memory b = bytes(name);
        uint256 len = b.length;
        if (len < 2 || len > 32) revert InvalidName(name);
        for (uint256 i = 0; i < len; i++) {
            bytes1 ch = b[i];
            bool ok = (ch >= 0x30 && ch <= 0x39) // 0-9
                || (ch >= 0x61 && ch <= 0x7a)    // a-z
                || ch == 0x2d                    // -
                || ch == 0x5f;                   // _
            if (!ok) revert InvalidName(name);
        }
    }

    /// @dev Versions are restricted to `^[A-Za-z0-9._+-]{1,32}$` so SemVer and
    ///      common pre-release/build syntaxes survive without forcing a
    ///      particular spec.
    function _validateVersion(string calldata version) private pure {
        bytes memory b = bytes(version);
        uint256 len = b.length;
        if (len == 0 || len > 32) revert InvalidVersion(version);
        for (uint256 i = 0; i < len; i++) {
            bytes1 ch = b[i];
            bool ok = (ch >= 0x30 && ch <= 0x39)
                || (ch >= 0x41 && ch <= 0x5a)
                || (ch >= 0x61 && ch <= 0x7a)
                || ch == 0x2d
                || ch == 0x2b
                || ch == 0x2e
                || ch == 0x5f;
            if (!ok) revert InvalidVersion(version);
        }
    }
}
