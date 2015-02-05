// CCU.IO Sensoren / Aktoren ueber extern auszufuehrende Kommandos
// 1'2015 Sven Giermann
//
// Input-Datenpunkte:
//    77100:{
//        "name":     "...",                    // Name des zu erstellenden Datenpunktes
//        "type":     ["bool"|"int"|"float"],
//        "interval":  1000,                    // Ausfuehrungsinterval in ms
//        "cmdRead":  "sudo ..."                // Kommando zum Lesen des Wertes (Rueckgabe ueber stdout)
//    }
//
// Multi-Input-Datenpunkte:
//    77100:{
//        "name":     "...",                    // Name des zu erstellenden Datenpunktes
//        "type":     "multi",
//        "clients":  [77101, 77102],           // Anzahl Clients bestimmt die Anzahl erwarteter Zeichen
//        "interval":  1000,                    // Ausfuehrungsinterval in ms
//        "cmdRead":  "sudo ..."                // Kommando zum Lesen des Wertes (Rueckgabe ueber stdout)
//    },
//    77101:{                                   // Typ ist hier immer "bool", also 0 oder 1 aus stdout
//        "name":     "..."                     // Name des zu erstellenden Datenpunktes
//    },
//    77102:{
//        "name":     "..."                     // Name des zu erstellenden Datenpunktes
//    }

// ps -edfa f |grep ' \\_ /opt/ccu.io/tools/dlpio8.arm'|cut -b 9-15 | xargs kill
// ln -sf dlpio8.new /opt/ccu.io/tools/dlpio8.arm

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Konfiguration
//
var debugLogLevel = 3;

var externCmdDP = {
    77100:{
        "name":     "Heizung.Brenner.Relais",
        "type":     "bool",                     // out
        "cmdTrue":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -01",
        "cmdFalse": "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -11"
    },
//    77101:{
//        "name":     "Heizung.Brenner.Status",
//        "type":     "bool",                     // in
//        "interval":  1000,
//        "cmdRead":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB0 -i1"
//    },
    77102:{
        "name":     "Heizung.Brauchwasser.Relais",
        "type":     "bool",                     // out
        "cmdTrue":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -05",
        "cmdFalse": "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -15"
    },
    77103:{
        "name":     "Heizung.Fussboden.Relais",
        "type":     "bool",                     // out
        "cmdTrue":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -02",
        "cmdFalse": "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -12"
    },
//        "mixOff":   "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -13 -14",
//        "mixUp":    "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -04 -03",
//        "mixDown":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -14 -03"
    77104:{
        "name":     "Heizung.Heizkreis.Relais",
        "type":     "bool",                     // out
        "cmdTrue":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -06",
        "cmdFalse": "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -16"
    },
//        "mixOff":   "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -17 -18",
//        "mixUp":    "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -08 -07",
//        "mixDown":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -18 -07"
    77101:{
        "name":     "Heizung.Brenner.Status",
        "type":     "multi",                    // in bool, erstes Zeichen: 0/1
        "clients":  [77105, 77106, 77107],             // folgende Zeichen in diese IDs
        "interval":  1000,
        "cmdRead":  "sudo /opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB0 -b14"
    },
    77105:{
        "name":     "Heizung.Heizkreis.Status"
    },
    77106:{
        "name":     "Heizung.Heizkreis.MischAuf"
    },
    77107:{
        "name":     "Heizung.Heizkreis.MischZu"
    }
}


//////////////////////////////////////////////////////////////////////////////////////////////
//
// Hilfsfunktionen
//
var cp = require('child_process');

function logOutput(level, str) {
//        "1": "debug  ",
//        "2": "verbose",
//        "3": "info   ",
//        "4": "warn   ",
//        "5": "error  "
    if (level >= debugLogLevel) log(str);
}

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Ueberwachung/Auslesen eines externen Zustandes (An-Ueberwachung mittels externem Programm)
//
function observeExternIn(objectId) {
    var cmd = externCmdDP[objectId].cmdRead;
    logOutput(1, "[observeExternIn] #" + objectId + " --> " + cmd);

    // ggf. async starten (spawn), dann muessten die Parameter in eigenem Array stehen
    cp.exec(cmd, function(err, stdout, stderr) {
        if (err) {
            logOutput(5, "[observeExternIn] error executing command: " + cmd);
        } else if (stdout) {
            var newVal;
            logOutput(2, "[observeExternIn] got result: " + stdout);
            if (externCmdDP[objectId].type == "bool") {
                newVal = (parseInt(stdout) > 0 ? true : false);
            } else if (externCmdDP[objectId].type == "int") {
                newVal = parseInt(stdout);
            } else if (externCmdDP[objectId].type == "float") {
                newVal = parseFloat(stdout);
            } else if (externCmdDP[objectId].type == "multi") {
                for (var n in externCmdDP[objectId].clients) if (stdout.length > n) {
                    newVal = (stdout.charAt(parseInt(n)+1) > 0 ? true : false);
                    if ((getState(externCmdDP[objectId].clients[n]) != newVal) ||
                        ((new Date() - Date.parse(getTimestamp(externCmdDP[objectId].clients[n]))) > 3600000)) {
                        logOutput(2, "[observeExternIn] #" + externCmdDP[objectId].clients[n] + " = " + newVal);
                        setState(externCmdDP[objectId].clients[n], newVal);
                    } else {
                        logOutput(1, "[observeExternIn] #" + externCmdDP[objectId].clients[n] + " is already " + newVal);
                    }
                }
                newVal = (stdout.charAt(0) > 0 ? true : false);
            }
            // Setzen des gleichen Wertes vermeiden, aber jede Stunde zwangsweise wegschreiben
            if ((getState(objectId) != newVal) ||
                ((new Date() - Date.parse(getTimestamp(objectId))) > 3600000)) {
                logOutput(2, "[observeExternIn] #" + objectId + " = " + newVal);
                setState(objectId, newVal);
            } else {
                logOutput(1, "[observeExternIn] #" + objectId + " is already " + newVal);
            }
        }
    });

    setTimeout(function(){ observeExternIn(objectId); } , externCmdDP[objectId].interval);
}


function observeExternOut(data) {
    var cmd;

    // nur bei Aenderungen Kommando ausfuehren
    if (data.newState.value != data.oldState.value) {
        // TODO: weitere Typen unterstuetzen
        if (externCmdDP[data.id].type == "bool") {
            if (data.newState.value > 0)
                cmd = externCmdDP[data.id].cmdTrue;
            else
                cmd = externCmdDP[data.id].cmdFalse;;
        }
        logOutput(2, "[observeExternOut] " + data.name + " #" + data.id + " = " + data.newState.value + " --> " + cmd);

        // ggf. async starten (spawn), dann muessten die Parameter in eigenem Array stehen
        cp.exec(cmd, function(err, stdout, stderr) {
            if (err) {
                logOutput(5, "[observeExternOut] error executing command: " + cmd);
                logOutput(5, "[observeExternOut] " + stderr);
            } else if (stdout) {
                // TODO: vielleicht einen Status setzen, um gleichzeitige Ausfuehrung zu verhindern?
            }
        });
    }
}



//////////////////////////////////////////////////////////////////////////////////////////////
//
// Initialisierung(en)
//

function initExternCmd() {
    // Datenpunkte erstellen und Ueberwachung starten
    for (var externCmd in externCmdDP) {
        // TODO: auf numerische ID pruefen, um Falschkonfiguration zu verhindern
        if (!externCmdDP[externCmd].name)
            externCmdDP[externCmd].name = "externCmd." + externCmd;

        // Datenpunkt erstellen
        setObject(externCmd, {
            Name: externCmdDP[externCmd].name,
            TypeName: "VARDP",
            _persistent: true
        });

        if (externCmdDP[externCmd].interval) {
            externCmdDP[externCmd].interval = parseInt(externCmdDP[externCmd].interval);
            // In - interval 100...86400000 ms (100 ms ... 1 day)
            if (externCmdDP[externCmd].interval < 100) {
                logOutput(4, "[initExternCmd] adjusting interval from " + externCmdDP[externCmd].interval + " to 100.");
                externCmdDP[externCmd].interval = 100;
            }
            if (externCmdDP[externCmd].interval > 86400000) {
                logOutput(4, "[initExternCmd] adjusting interval from " + externCmdDP[externCmd].interval + " to 86400000.");
                externCmdDP[externCmd].interval = 86400000;
            }

            if (externCmdDP[externCmd].cmdRead)
                observeExternIn(externCmd); // plant sich selbst neu
        } else if (externCmdDP[externCmd].type) {
            // Out
            subscribe({
                id: externCmd
            },
                observeExternOut
            );
        }

        logOutput(3, "[initExternCmd] created datapoint #" + externCmd + " '" + externCmdDP[externCmd].name + "'.");
    }
}


initExternCmd();
