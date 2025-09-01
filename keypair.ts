import { generateKeyPairSync } from "crypto";
console.log("init key pair");

const keyPair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: "pkcs1",
        format: "pem",
    },
    privateKeyEncoding: {
        type: "pkcs1",
        format: "pem",
    },
});

export function useKeyPair() {
    return keyPair;
}