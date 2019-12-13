'use strict';

const fs = require('fs');
const xmlbuilder = require('xmlbuilder');
const xmlparser = require('fast-xml-parser');
const format = require('string-format');

const Severity = Object.freeze(
    {
        Information: 0,
        Low: 1,
        Medium: 2,
        High: 3
    });

format.extend(String.prototype, {});

function groupBy(array, f)
{
    let groups = {};
    array.forEach(function(item)
    {
        let group = JSON.stringify(f(item));
        groups[group] = groups[group] || [];
        groups[group].push(item);
    });
    return Object.keys(groups).map(function(group)
    {
        return groups[group];
    });
}

function isAboveThreshold(issue, threshold) {
    if (Severity[threshold] === undefined) {
        throw Error('Unknown severity threshold specified {}'.format(threshold));
    }

    if (Severity[issue.severity] === undefined) {
        throw Error('Issue has unknown severity {}'.format(issue.severity));
    }

    return Severity[issue.severity] >= Severity[threshold];
}

function createJunitReport(issueReportFilename, junitReportFilename, threshhold) {

    let scanReport = xmlparser.parse(fs.readFileSync(issueReportFilename).toString());
    let groupedIssues = groupBy(scanReport.issues.issue || [], function(item)
    {
        return [item.name];
    });

    let junitReport = xmlbuilder.create('testsuites');
    groupedIssues.forEach(function (group) {
        junitReport = junitReport.ele('testsuite')
            .att('name', group[0].name)
            .att('tests', group.length)
            .att('package', group[0].type);

        group.forEach(function (issue) {
            junitReport = junitReport
                .ele('testcase')
                .att('name', 'Issue-{}'.format(issue.serialNumber))
                .att('classname', issue.name)
                .att('status', issue.severity + '/' + issue.confidence);

            if (isAboveThreshold(issue, threshhold)) {
                let description = 'Host: {}\nPath: {}\nSeverity: {}\nConfidence: {}\nType: {}\nSerial Number: {}\nBackground: {}\nDetail: {}'
                    .format(issue.host, issue.path, issue.severity, issue.confidence, issue.type, issue.serialNumber, issue.issueBackground, issue.issueDetail);

                junitReport = junitReport
                    .ele('failure', description)
                    .att('message', issue.name)
                    .up();
            }
            junitReport = junitReport.up();
        });
        junitReport = junitReport.up();
    });

    junitReport = junitReport.end({ pretty: true});

    fs.writeFileSync(junitReportFilename, junitReport);
}

module.exports.createJunitReport = createJunitReport;
