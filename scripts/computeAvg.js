/*
 *  CCU.IO - AddOn script
 *
 *  Compute average values per day and store them in JSON
 *
 *  SG, 24.02.2015
 *
 */

var ccuPath = "/opt/ccu.io";
var fs =        require('fs');
var settings = {};

var defSettings = {
    77001: {diff:1,              name:"Brennerstarts"},
    77003: {diff:1, factor:100,  name:"Oelvorrat"},
    77002: {diff:1,              name:"Brennerlaufzeit"},
    77004: {avg:1,               name:"Kessel.Soll"},
    77014: {avg:1,               name:"Brauchwasser.Soll"},
    77024: {max:1, min:1, avg:1, name:"FB.Soll"},
    77025: {avg:1,               name:"FB.RaumSoll"},
    77034: {max:1, min:1, avg:1, name:"HK.Soll"},
    77035: {avg:1,               name:"HK.RaumSoll"},
    77107: {time:1,              name:"Brenner"},
    77108: {time:1,              name:"FB.Pumpe"},
    77109: {time:1,              name:"HK.Pumpe"},
    74309: {max:1, min:1, avg:1, name:"Wohnzimmer"},
    74310: {max:1, min:1, avg:1, name:"Aussentemperatur"}
};

function readAvgFile() {
    try {
        var storedValues = fs.readFileSync(ccuPath+"/datastore/average-variables.json");
        settings = JSON.parse(storedValues.toString());
    } catch (e) {
        console.log("ERROR reading stored values.\n"+JSON.stringify(e));
        settings = defSettings;
    }
    if (!settings.values) settings.values = {};
}

function makeCSV() {
    var csvArr = [], csvLine = "";

    // Header line
    csvLine = csvLine + '"Date";';
    for (var dp in settings) if (dp != "values")
        for (var set in settings[dp]) if ((set != "name") && (set != "factor"))
            csvLine = csvLine + '"'+(settings[dp].name || dp)+'['+set+']";';

    csvArr.push(csvLine);
    if (settings.values) for (var day in settings.values) {
        csvLine = '"'+day+'";';
        for (var dp in settings) if (dp != "values")
            for (var set in settings[dp]) if ((set != "name") && (set != "factor"))
                if (!settings.values[day][dp] || !settings.values[day][dp][set]) {
                    csvLine = csvLine + ';';
                } else if (settings[dp].factor) {
                    csvLine = csvLine + '"'+(settings.values[day][dp][set] * settings[dp].factor)+'";';
                } else {
                    csvLine = csvLine + '"'+settings.values[day][dp][set]+'";';
                }
        csvArr.push(csvLine.replace(/\./g, ','));
    }

    return csvArr.join("\n") + "\n";
}

function writeAvgFile() {
    var str = JSON.stringify(settings);

    // add some newline and spaces
    str = str.replace(/("values":)/g, '\n$1');
    str = str.replace(/("[-0-9]*":)/g, '\n    $1');
    str = str.replace(/    ("[0-9][0-9][0-9][0-9]-[-0-9]*":)/g, '\n  $1');
    str = str.replace(/}}}}/g, '}}\n}}\n');

    try {
        console.log("Writing settings back to "+ccuPath+"/datastore/average-variables.json");
        fs.writeFileSync(ccuPath+"/datastore/average-variables.json", str);
    } catch (e) {
        console.log("ERROR writing stored values!\n"+JSON.stringify(e));
    }
    try {
        console.log("Writing settings back to "+ccuPath+"/www/average.csv");
        fs.writeFileSync(ccuPath+"/www/average.csv", makeCSV());
    } catch (e) {
        console.log("ERROR writing CSV values!\n"+JSON.stringify(e));
    }
}


function processLogFile(day, data) {
    var dataArr = data.split("\n");
    var l = dataArr.length;

    if (l < 1) return;
//    var triple = dataArr[0].split(" ", 3);
//    var timestamp = new Date(triple[0] * 1000);
//    var day = timestamp.getFullYear() + '-' +
//        ("0" + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
//        ("0" + (timestamp.getDate()).toString(10)).slice(-2);

    // already processed this file
    if (settings.values[day]) return;
    
    var tmpArr = {}; // aggregated values
    var lastTS;
    for (var i = 0; i < l; i++) {
        var triple = dataArr[i].split(" ", 3);
        var floatVal = parseFloat(triple[2]);
        if (settings[triple[1]]) {
            if (!tmpArr[triple[1]]) {
                tmpArr[triple[1]] = {};
                // assume sorted values inside file, so this is the first
                tmpArr[triple[1]].firstTS = triple[0];
                tmpArr[triple[1]].ts      = triple[0];
                tmpArr[triple[1]].value   = triple[2];
            } else if (tmpArr[triple[1]].value != triple[2]) {
                var timeDiff = (parseInt(triple[0]) - parseInt(tmpArr[triple[1]].ts)) / 3600;

                if (settings[triple[1]].min || settings[triple[1]].diff) {
                    if (!tmpArr[triple[1]].min || (tmpArr[triple[1]].min > floatVal))
                        tmpArr[triple[1]].min = floatVal;
                }
                if (settings[triple[1]].max || settings[triple[1]].diff) {
                    if (!tmpArr[triple[1]].max || (tmpArr[triple[1]].max < floatVal))
                        tmpArr[triple[1]].max = floatVal;
                }

                if (settings[triple[1]].avg) {
                    tmpArr[triple[1]].avgSum  = (tmpArr[triple[1]].avgSum || 0) + floatVal * timeDiff;
                    tmpArr[triple[1]].avgTime = (tmpArr[triple[1]].avgTime || 0) + timeDiff;
                }
                if (settings[triple[1]].time) {
                    // Ausschaltvorgang, also Zeit (in h) addieren
                    if ((tmpArr[triple[1]].value >= 0) || (tmpArr[triple[1]].value == "true"))
                        if ((triple[2] == 0) || (triple[2] == "false"))
                            tmpArr[triple[1]].time = (tmpArr[triple[1]].time || 0) + timeDiff;
                }

                tmpArr[triple[1]].ts      = triple[0];
                tmpArr[triple[1]].value   = triple[2];
            }

            // assume sorted values inside file, so this is the last
            tmpArr[triple[1]].lastTS = triple[0];
            lastTS = triple[0];
        }
    }

    // now compute average, diff and store in settings.values
    for (dp in tmpArr) if (settings[dp]) {
        if (!settings.values[day]) settings.values[day] = {};
        settings.values[day][dp] = {};

        var timeDiff = (parseInt(lastTS) - parseInt(tmpArr[dp].ts)) / 3600;
        if (!tmpArr[dp].avgTime) {
            tmpArr[dp].avgSum  = parseFloat(tmpArr[dp].value);
            tmpArr[dp].avgTime = 1;
        } else {
            // add last value until end of day
            tmpArr[dp].avgSum  = tmpArr[dp].avgSum + parseFloat(tmpArr[dp].value) * timeDiff;
            tmpArr[dp].avgTime = tmpArr[dp].avgTime + timeDiff;
        }
        // still on? add time...
        if ((tmpArr[dp].value >= 0) || (tmpArr[dp].value == "true"))
            tmpArr[dp].time = (tmpArr[dp].time || 0) + timeDiff;
        tmpArr[dp].diff = tmpArr[dp].max - tmpArr[dp].min;
        tmpArr[dp].avg  = tmpArr[dp].avgSum / tmpArr[dp].avgTime;

        for (var set in settings[dp]) if ((set != "name") && (set != "factor"))
            settings.values[day][dp][set] = tmpArr[dp][set];
    }
}

function processLogFilesAsync(folder, files) {
    var path = files.pop();
    if (path) {
        fs.readFile(folder + path, function (err, data) {
            if (err) {
                console.log(JSON.stringify(err));
            } else {
                console.log(this.fold + this.file + "...");
                processLogFile(this.file.substring(22), data.toString());
            }
            processLogFiles(this.fold, this.remain);
        }.bind({ file: path, remain: files, fold: folder }));
    } else {
        writeAvgFile();
    }
}

function processLogFiles(folder, files) {
    for (var idx in files) {
        try {
            console.log(folder + files[idx] + "...");
            var data = fs.readFileSync(folder + files[idx]);
            processLogFile(files[idx].substring(22), data.toString());
        } catch (e) {
            console.log("  ERROR: "+JSON.stringify(e));
        }
    }
    writeAvgFile();
}

function main(folder) {
    var folder = ccuPath+"/log/";

    readAvgFile();

    // cycle through log folder
    fs.readdir(folder, function (err, data) {
        if (err) {
            console.log("Unable to read dir: "+folder);
        } else {
            var files = [];
            for (var i = 0; i < data.length; i++) {
                if (data[i].match(/devices\-variables\.log\./)) {
                    files.push(data[i]);
                }
            }
            // do serial processing here
            processLogFiles(folder, files);
        }
    });
}

main();

// Taeglich um 2 Uhr ausführen
schedule("0 2 * * *", main);

