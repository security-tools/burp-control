#!/usr/bin/env node
'use strict';

const program = require('commander');
const figlet = require('figlet');
const chalk = require('chalk');
const tmp = require('tmp');
const format = require('string-format');
const fs = require('fs');
const path = require('path');
const request = require('sync-request');
const spawn = require('child_process').spawn;


const default_configfile = 'config.json';
const max_startup_time = 20;

format.extend(String.prototype, {});

program
    .version(getVersion());

program
    .command('crawl [config]')
    .description('Crawl using the specified configuration file')
    .action((config) => crawlAction(config));

program
    .command('scan [config]')
    .description('Scan using the specified configuration file')
    .action((config) => scanAction(config));

program
    .command('report [config]')
    .description('Generate a report using the specified configuration file')
    .option('-f, --file <file>', 'Report file')
    .option('-t, --type <type>', 'Report type', /^(html|xml)$/i, 'html')
    .action((config, options) => reportAction(config, options));

program
    .command('start [config]')
    .description('Stopping Burp using the specified configuration file')
    .action((config) => startAction(config));

program
    .command('stop [config]')
    .description('Stopping Burp using the specified configuration file')
    .action((config) => stopAction(config));

program
    .command('status [config]')
    .description('Return the Burp status using the specified configuration file')
    .action((config) => statusAction(config));

program.on('command:*', function () {
    console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
    process.exit(1);
});

program.parse(process.argv);

if (!process.argv.slice(2).length) {
    console.error('Missing command\nSee --help for a list of available commands.');
    process.exit(1);
}

function printIntro() {
    console.log(
            chalk.blue(
                figlet.textSync('Burp Controller', { font: 'ogre'})
        )
    );
    console.log('Burp Controller {}'.format(getVersion()));
    console.log('');

}

function stopAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || default_configfile);
        console.log('[+] Shutting down Burp Suite ...');
        let response = request('GET', '{}/burp/stop'.format(config.api_url));
        handleResponse(response);
        console.log('[-] Burp Suite is stopped');
    }
    catch(e) {
        console.log('Stop failed: {}'.format(e.message));
        process.exit(1);
    }
}

function startAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || default_configfile);
        console.log('[+] Starting Burp Suite ...');

        let prc = spawn('java',  ['-jar', config.burp_lib, '-Xmx1024M', '--headless.mode=true'], {
            shell: true,
            detached: true,
            stdio: ['ignore', fs.openSync('std.out', 'w'), fs.openSync('err.out', 'w')]
        });
        console.log("[-] Burp Suite pid: {}".format(prc.pid));
        prc.unref();
        waitUntilBurpIsReady(config.api_url);
        console.log('[-] Burp Suite is started');
    }
    catch(e) {
        console.log('Start failed: {}'.format(e.message));
        process.exit(1);
    }
}

function reportAction(configfile, options) {
    try {
        printIntro();
        getReport(loadConfiguration(configfile || default_configfile).api_url, options.file, options.type);
    }
    catch(e) {
        console.log('Report download failed: {}'.format(e.message));
        process.exit(1);
    }
}

function scanAction(configfile) {
    try {
        let config = loadConfiguration(configfile || default_configfile);
        updateScope(config.api_url, config.targetScope);
        console.log('[+] Active scan started ...');

        config.scan_targets.forEach(function(entry) {
            scan(config.api_url, entry);
        });

        pollScanStatus(config.api_url);
        console.log('[+] Scan completed');
        console.log('[+] Scan issues:');

        let issueNames = new Set();
        getIssues(config.api_url).forEach(function(issue) {
            issueNames.add(issue.issueName);
        });

        issueNames.forEach(function(issue) {
            console.log('  - {}'.format(issue));
        });
    }
    catch(e) {
        console.log('Scan failed: {}'.format(e.message));
        process.exit(1);
    }
}

function crawlAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || default_configfile);
        updateScope(config.api_url, config.targetScope);
        console.log('[+] Crawl started ...');
        config.crawl_targets.forEach(function (entry) {
            crawl(config.api_url, entry);
        });

        pollCrawlStatus(config.api_url);
        console.log('[+] Crawl completed');
    }
    catch(e) {
        console.log('Crawl failed: {}'.format(e.message));
        process.exit(1);
    }
}

function statusAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || default_configfile);
        console.log('[+] Retrieving status ...');
        let burpVersion = getBurpVersion(config.api_url);
        console.log('[-] {} is running'.format(burpVersion));
        console.log('[+] Retrieving status completed');
    }
    catch(e) {
        console.log('Retrieving status failed: {}'.format(e.message));
        process.exit(1);
    }
}

function getBurpVersion(apiUrl) {
    let response = request('GET', '{}/burp/versions'.format(apiUrl));
    handleResponse(response);
    return JSON.parse(response.getBody('utf8')).burpVersion;
}

function getReport(apiUrl, reportfile, reporttype) {
    let response = request('GET', '{}/burp/report?reportType={}'.format(apiUrl, reporttype.toUpperCase()));
    handleResponse(response);
    console.log('[+] Downloading HTML/XML report');
    let filename = reportfile || path.join(tmp.dirSync().name, 'burp-report-{}.{}'.format(
        new Date().toISOString(),
        'html'));

    fs.writeFile(filename, response.body, function(err) {
        if (err) {
            throw err;
        }
        console.log('[-] Scan report saved to {}'.format(filename));
    });
}

function waitUntilBurpIsReady(apiUrl) {
    let elapsedSeconds = 0;
    process.stdout.write('[-] Waiting for Burp Suite...');
    let burpVersion;
    do {
        sleep(1000);
        elapsedSeconds += 1;
        try {
            burpVersion = getBurpVersion(apiUrl);
            break;
        } catch(e) {
            process.stdout.write('.');
        }
    } while (elapsedSeconds < max_startup_time);
    if (burpVersion) {
        process.stdout.write('success');
        console.log();
        console.log('[-] {} is running'.format(burpVersion));
    }
    else {
        process.stdout.write('failed (timeout)');
        console.log();
        throw new Error("Burp Suite is not reachable");
    }
}

function pollCrawlStatus(apiUrl) {
    let status = 0;
    do {
        sleep(1000);
        status = crawlStatus(apiUrl);
        process.stdout.write('\r[-] Crawl in progress: {}%'.format(status));

    } while (status != 100);
    console.log();
}

function pollScanStatus(apiUrl) {
    let status = 0;
    do {
        sleep(1000);
        status = scanStatus(apiUrl);
        process.stdout.write('\r[-] Scan in progress: {}%'.format(status));

    } while (status != 100);
    console.log();
}


function updateScope(apiUrl, scope) {
    console.log('[+] Updating the scope ...');
    scope.include.forEach(function(entry) {
       includeInScope(apiUrl, entry);
    });
    scope.exclude.forEach(function(entry) {
        excludeFromScope(apiUrl, entry);
    });
    console.log('[+] Scope updated');

}

function excludeFromScope(apiUrl, url) {
    //console.log('Excluding from scope...: {}'.format(url));
    let response = request('DELETE', '{}/burp/target/scope?url={}'.format(apiUrl, url));
    handleResponse(response);
    console.log('[-] Excluded from scope: {}'.format(url));
}

function includeInScope(apiUrl, url) {
    // console.log('Including in scope...: {}'.format(url));
    let response = request('PUT', '{}/burp/target/scope?url={}'.format(apiUrl, url));
    handleResponse(response);
    console.log('[-] Included in scope: {}'.format(url));
}

function crawl(apiUrl, baseUrl) {
    //console.log('Adding to the crawl queue: {}'.format(baseUrl));
    let response = request('POST', '{}/burp/spider?baseUrl={}'.format(apiUrl, baseUrl));
    handleResponse(response);
    console.log('[-] Added to the crawl queue: {}'.format(baseUrl));
}

function crawlStatus(apiUrl) {
    let response = request('GET', '{}/burp/spider/status'.format(apiUrl));
    return JSON.parse(response.getBody('utf8')).spiderPercentage;
}

function scan(apiUrl, baseUrl) {
    //console.log('Adding to the crawl queue: {}'.format(baseUrl));
    let response = request('POST', '{}/burp/scanner/scans/active?baseUrl={}'.format(apiUrl, baseUrl));
    handleResponse(response);
    console.log('[-] Added to the scan queue: {}'.format(baseUrl));
}

function scanStatus(apiUrl) {
    let response = request('GET', '{}/burp/scanner/status'.format(apiUrl));
    return JSON.parse(response.getBody('utf8')).scanPercentage;
}

function getIssues(apiUrl) {
    let response = request('GET', '{}/burp/scanner/issues'.format(apiUrl));
    return JSON.parse(response.getBody('utf8')).issues;
}

function loadConfiguration(filename) {

    let contents;
    try {
        contents = fs.readFileSync(filename || default_configfile);
    } catch(e) {
        if (e.code === 'ENOENT') {
            throw new Error('Configuration file {} not found'.format(filename));
        } else {
            throw e;
        }
    }

    try {
        return JSON.parse(contents);

    } catch(e) {
        throw new Error('Unable to parse configuration {}'.format(filename));
    }
}

function handleResponse(response) {
    if (response.statusCode >= 300) {
        let err = new Error('API status error: {}'.format(response.statusCode));
        err.statusCode = response.statusCode;
        err.headers = response.headers;
        err.body = response.body.toString('utf-8');
        throw err;
    }
}

function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getVersion() {
    let packagefile = path.resolve(__dirname + "/../package.json");
    try {
        let packageconfig = fs.readFileSync(packagefile);
        return JSON.parse(packageconfig).version;
    } catch(e) {
        return 'unknown';
    }

}
