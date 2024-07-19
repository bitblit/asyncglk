/*

Common Dialog functions
=======================

Copyright (c) 2024 Dannii Willis
MIT licenced
https://github.com/curiousdannii/asyncglk

*/

import type {FileType} from '../../common/protocol.js'

/** File extensions for Glk file types */
export function filetype_to_extension(filetype: FileType): string {
    switch (filetype) {
        case 'command':
        case 'transcript':
            return '.txt'
        case 'save':
            return '.glksave'
        default:
            return '.glkdata'
    }
}

/** Construct a file-filter list for a given usage type. */
export function filters_for_usage(usage: string | null) {
    switch (usage) {
        case 'data': 
            return [ { name: 'Glk Data File', extensions: ['glkdata'] } ]
        case 'save': 
            return [ { name: 'Glk Save File', extensions: ['glksave'] } ]
        case 'transcript': 
            return [ { name: 'Transcript File', extensions: ['txt'] } ]
        case 'command': 
            return [ { name: 'Command File', extensions: ['txt'] } ]
        default:
            return []
    }
}

/** Convert a native path to a POSIX path */
export function path_native_to_posix(path: string): string {
    if (process.platform === 'win32') {
        throw new Error('not implemented')
    }
    else {
        return path
    }
}

/** Convert a POSIX path to a native path */
export function path_posix_to_native(path: string): string {
    if (process.platform === 'win32') {
        throw new Error('not implemented')
    }
    else {
        return path
    }
}