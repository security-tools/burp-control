'use strict';

const path = require('path');
const fs = require('fs');

function burpJar() {
    let packPath = packagePath();
    let lib = require(packPath).burpJar;
    return path.join(path.dirname(packPath), lib);
}

function burpApiJar() {
    let packPath = packagePath();
    let lib = require(packPath).burpApiJar;
    return path.join(path.dirname(packPath), lib);
}

function burpExtensions() {
    let packPath = packagePath();
    let extPath = require(packPath).burpExtensions;
    let extDir = path.join(path.dirname(packPath), extPath);
    return fs.readdirSync(extDir)
        .filter((f) => f.endsWith('.jar'))
        .map((f) => path.join(extDir, f));

}

function packagePath() {
    try {
        return require.resolve('burp-suite/package.json');
    } catch (error) {
            throw new Error('Unable to locate optional package burp-suite');
    }
}

module.exports.burpJar = burpJar;
module.exports.burpApiJar = burpApiJar;
module.exports.burpExtensions = burpExtensions;
