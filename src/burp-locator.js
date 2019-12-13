'use strict';

const path = require('path');

function burpJar() {
    const pack = 'burp-suite/package.json';
    try {
        let packPath = require.resolve(pack);
        let lib = require(packPath).burpJar;
        return path.join(path.dirname(packPath), lib);
    } catch (error) {
        if (error.code != 'MODULE_NOT_FOUND') {
            throw new Error('Unable to locate {}'.format(pack));
        }
        throw error;
    }
}

function burpApiJar() {
    const pack = 'burp-suite/package.json';
    try {
        let packPath = require.resolve(pack);
        let lib = require(packPath).burpApiJar;
        return path.join(path.dirname(packPath), lib);

    } catch (error) {
        if (error.code != 'MODULE_NOT_FOUND') {
            throw new Error('Unable to locate {}'.format(pack));
        }
        throw error;
    }
}

module.exports.burpJar = burpJar;
module.exports.burpApiJar = burpApiJar;