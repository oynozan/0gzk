pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Privacy-preserving geofence: prove a private (lat, lng) lies inside a public
// rectangular bounding box without revealing the exact point.
//
// Coordinates are encoded as unsigned 32-bit fixed-point integers with two
// offsets so all values stay positive in the BN128 field:
//
//   latEncoded = round((lat_degrees + 90)  * 1e6)   // range [0, 180e6]
//   lngEncoded = round((lng_degrees + 180) * 1e6)   // range [0, 360e6]
//
// 32 bits is plenty (2^32 > 4e9 >> 360e6). The same encoding applies to the
// public box bounds; the publisher of the box decides the convention.
//
// Public:   latMin, latMax, lngMin, lngMax
// Private:  lat, lng
template GeofenceProof() {
    signal input lat;
    signal input lng;
    signal input latMin;
    signal input latMax;
    signal input lngMin;
    signal input lngMax;

    // Range-check every coordinate so LessEqThan stays sound.
    component latBits = Num2Bits(32);
    latBits.in <== lat;
    component lngBits = Num2Bits(32);
    lngBits.in <== lng;
    component latMinBits = Num2Bits(32);
    latMinBits.in <== latMin;
    component latMaxBits = Num2Bits(32);
    latMaxBits.in <== latMax;
    component lngMinBits = Num2Bits(32);
    lngMinBits.in <== lngMin;
    component lngMaxBits = Num2Bits(32);
    lngMaxBits.in <== lngMax;

    component latLo = GreaterEqThan(32);
    latLo.in[0] <== lat;
    latLo.in[1] <== latMin;
    latLo.out === 1;

    component latHi = LessEqThan(32);
    latHi.in[0] <== lat;
    latHi.in[1] <== latMax;
    latHi.out === 1;

    component lngLo = GreaterEqThan(32);
    lngLo.in[0] <== lng;
    lngLo.in[1] <== lngMin;
    lngLo.out === 1;

    component lngHi = LessEqThan(32);
    lngHi.in[0] <== lng;
    lngHi.in[1] <== lngMax;
    lngHi.out === 1;
}

component main { public [latMin, latMax, lngMin, lngMax] } = GeofenceProof();
