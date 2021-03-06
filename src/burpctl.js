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
const junit = require('./junit-report.js');
const burplocator = require('./burp-locator.js');

const defaultConfigfile = 'config.json';
const maxStartupTime = 60;

format.extend(String.prototype, {});

program
    .version(version());

program
    .command('crawl [config]')
    .description('Crawl using the specified config file')
    .action((config) => crawlAction(config));

program
    .command('scan [config]')
    .description('Scan using the specified config file')
    .option('-m, --mode <mode>', 'Scan mode', /^(active|passive)$/i, 'active')
    .action((config, options) => scanAction(config, options));

program
    .command('report [config]')
    .description('Generate a report using the specified config file')
    .option('-f, --file <file>', 'Report file')
    .option('-t, --type <type>', 'Report type', /^(html|xml)$/i, 'html')
    .action((config, options) => reportAction(config, options));

program
    .command('junit [config]')
    .description('Generate a junit report using the specified config file')
    .option('-f, --file <file>', 'Report file')
    .option('-t, --threshold <threshold>', 'Severity threshold', /^(Information|Low|Medium|High)$/i, 'High')
    .action((config, options) => junitAction(config, options));

program
    .command('start [config]')
    .description('Start Burp Suite using the specified config file')
    .action((config) => startAction(config));

program
    .command('stop [config]')
    .description('Stop Burp Suite using the specified config file')
    .action((config) => stopAction(config));

program
    .command('status [config]')
    .description('Return the Burp Suite status using the specified config file')
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
                figlet.textSync('BurpControl', { font: 'ogre'})
        )
    );
    console.log('BurpControl {}'.format(version()));
    console.log('');
}

function stopAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || defaultConfigfile);
        console.log('[+] Shutting down Burp Suite ...');
        let response = request('GET', '{}/burp/stop'.format(config.apiUrl));
        handleResponse(response);
        console.log('[-] Burp Suite is stopped');
    }
    catch(e) {
        console.log('Stop failed: {}'.format(e.message));
        process.exit(1);
    }
}

async function startAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || defaultConfigfile);
        console.log('[+] Starting Burp Suite ...');

        if (isBurpApiAvailable(config.apiUrl)) {
            throw new Error('Burp Suite is already running');
        }

        if (!fs.existsSync(config.burpApiJar)) {
            throw new Error('Unable to locate Burp API jar: {}'.format(config.burpApiJar));
        }

        if (!fs.existsSync(config.burpJar)) {
            throw new Error('Unable to locate Burp jar: {}'.format(config.burpJar));
        }

        let options = ['-jar', config.burpApiJar, '--burp.jar=' + config.burpJar, '--headless.mode=' + config.headless];
        if (config.burpOptions) {
            options = options.concat(config.burpOptions);
        }
        if (config.burpExtensions) {
            config.burpExtensions.forEach(function(entry) {
                options = options.concat('--burp.ext=' + entry);
            });
        }

        let prc = spawn('java',  options, {
            shell: false,
            detached: true,
            stdio: ['ignore', fs.openSync('stdout.log', 'w'), fs.openSync('errout.log', 'w')]
        });
        if (prc.pid === undefined) {
            throw new Error('Error spawning process');
        }

        console.log("[-] Burp Suite pid: {}".format(prc.pid));
        prc.unref();
        await waitUntilBurpApiIsReady(config.apiUrl);
        console.log('[-] Burp Suite is started');
        console.log('[-] Swagger UI: {}/swagger-ui.html#/'.format(config.apiUrl));
        updateScope(config.apiUrl, config.targetScope);
    }
    catch(e) {
        console.log('Start failed: {}'.format(e.message));
        process.exit(1);
    }
}

function reportAction(configfile, options) {

    try {
        printIntro();
        getReport(loadConfiguration(configfile || defaultConfigfile).apiUrl, options.file, options.type);
    }
    catch(e) {
        console.log('Report download failed: {}'.format(e.message));
        process.exit(1);
    }
}

function junitAction(configfile, options) {

    try {
        printIntro();
        createJunitReport(loadConfiguration(configfile || defaultConfigfile).apiUrl, options.file, options.threshold);
    }
    catch(e) {
        console.log('Report download failed: {}'.format(e.message));
        process.exit(1);
    }
}

async function scanAction(configfile, options) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || defaultConfigfile);
        updateScope(config.apiUrl, config.targetScope);
        console.log('[+] Scan in {} mode started ...'.format(options.mode));

        config.scanTargets.forEach(function(entry) {
            scan(config.apiUrl, options.mode, entry);
        });

        await pollScanStatus(config.apiUrl);
        console.log('[+] Scan completed');
        console.log('[+] Scan issues:');

        let issueNames = new Set();
        getIssues(config.apiUrl).forEach(function(issue) {
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

async function crawlAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || defaultConfigfile);
        updateScope(config.apiUrl, config.targetScope);
        console.log('[+] Crawl started ...');
        config.crawlTargets.forEach(function (entry) {
            crawl(config.apiUrl, entry);
        });

        await pollCrawlStatus(config.apiUrl);
        console.log('[+] Crawl completed');
    }
    catch(e) {
        console.log('Crawl failed: {}'.format(e.message));
        process.exit(1);
    }
}

async function statusAction(configfile) {
    try {
        printIntro();
        let config = loadConfiguration(configfile || defaultConfigfile);
        console.log('[+] Retrieving status ...');
        let burpVersion = await getBurpVersion(config.apiUrl);
        console.log('[-] {} is running'.format(burpVersion));
        console.log('[+] Retrieving status completed');
    }
    catch(e) {
        console.log('Retrieving status failed: {}'.format(e.message));
        process.exit(1);
    }
}

function isBurpApiAvailable(apiUrl) {
    try {
        let response = request('GET', '{}/burp/versions'.format(apiUrl));
        handleResponse(response);
        return JSON.parse(response.getBody('utf8')).burpVersion !== undefined;
    }
    catch(e) {
        return false;
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
        new Date().toISOString()
            .replace(/:/g, ''),
        reporttype));

    fs.writeFileSync(filename, response.body);
    console.log('[-] Scan report saved to {}'.format(filename));
    return filename;
}

function createJunitReport(apiUrl, junitReportfile, threshold) {
    let reportfile = getReport(apiUrl, undefined, 'xml');

    console.log('[+] Generating JUnit report from scan report with threshold {}'.format(threshold));

    let filename = junitReportfile || path.join(tmp.dirSync().name, 'junit-report-{}.xml'.format(
        new Date().toISOString()
            .replace(/:/g, '')));

    junit.createJunitReport(reportfile, filename, threshold);
    console.log('[-] JUnit report saved to {}'.format(filename));

    fs.unlinkSync(reportfile);
    console.log('[-] Scan report {} deleted'.format(reportfile));


}

async function waitUntilBurpApiIsReady(apiUrl) {
    let elapsedSeconds = 0;
    process.stdout.write('[-] Waiting for Burp Suite...');
    let burpVersion;
    do {
        await sleep(1000); // eslint-disable-line no-await-in-loop
        elapsedSeconds += 1;
        try {
            burpVersion = getBurpVersion(apiUrl);
            break;
        } catch(e) {
            process.stdout.write('.');
        }
    } while (elapsedSeconds < maxStartupTime);
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

async function pollCrawlStatus(apiUrl) {
    let status = 0;
    do {
        await sleep(1000); // eslint-disable-line no-await-in-loop
        status = crawlStatus(apiUrl);
        process.stdout.write('\r[-] Crawl in progress: {}%'.format(status));

    } while (status != 100);
    console.log();
}

async function pollScanStatus(apiUrl) {
    let status = 0;
    do {
        await sleep(1000); // eslint-disable-line no-await-in-loop
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
    let response = request('DELETE', '{}/burp/target/scope?url={}'.format(apiUrl, url));
    handleResponse(response);
    console.log('[-] Excluded from scope: {}'.format(url));
}

function includeInScope(apiUrl, url) {
    let response = request('PUT', '{}/burp/target/scope?url={}'.format(apiUrl, url));
    handleResponse(response);
    console.log('[-] Included in scope: {}'.format(url));
}

function crawl(apiUrl, baseUrl) {
    let response = request('POST', '{}/burp/spider?baseUrl={}'.format(apiUrl, baseUrl));
    handleResponse(response);
    console.log('[-] Added to the crawl queue: {}'.format(baseUrl));
}

function crawlStatus(apiUrl) {
    let response = request('GET', '{}/burp/spider/status'.format(apiUrl));
    return JSON.parse(response.getBody('utf8')).spiderPercentage;
}

function scan(apiUrl, mode, baseUrl) {
    let response = request('POST', '{}/burp/scanner/scans/{}?baseUrl={}'.format(apiUrl, mode, baseUrl));
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
        contents = fs.readFileSync(filename || defaultConfigfile);
    } catch(e) {
        if (e.code === 'ENOENT') {
            throw new Error('Configuration file {} not found'.format(filename));
        } else {
            throw e;
        }
    }
    let config;
    try {
        config = JSON.parse(contents);
    } catch(e) {
        throw new Error('Unable to parse configuration {}. Cause: {}'.format(filename, e.message));
    }

    try {
        return  supplementDefaultConfig(config);
    } catch(e) {
        throw new Error('Unable to apply default configuration {}. Cause: {}'.format(filename, e.message));
    }
}

function supplementDefaultConfig(config) {
    console.log('[+] Loading default configuration properties');
    if (!Reflect.has(config, 'burpApiJar')) {
        config.burpApiJar = burplocator.burpApiJar();
        console.log('[-] burpApiJar: {}'.format(JSON.stringify(config.burpApiJar)));
    }
    if (!Reflect.has(config, 'burpJar')) {
        config.burpJar = burplocator.burpJar();
        console.log('[-] burpJar: {}'.format(JSON.stringify(config.burpJar)));
    }
    if (!Reflect.has(config, 'headless')) {
        config.headless = true;
        console.log('[-] headless: {}'.format(JSON.stringify(config.headless)));
    }
    if (!Reflect.has(config, 'burpExtensions')) {
        config.burpExtensions = burplocator.burpExtensions();
        console.log('[-] burpExtensions: {}'.format(JSON.stringify(config.burpExtensions)));
    }

    return config;
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

function version() {
    let packagefile = path.resolve(__dirname + "/../package.json");
    try {
        let packageconfig = fs.readFileSync(packagefile);
        return JSON.parse(packageconfig).version;
    } catch(e) {
        return 'unknown';
    }
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
