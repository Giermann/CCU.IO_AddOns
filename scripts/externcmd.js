// CCU.IO Sensoren / Aktoren ueber extern auszufuehrende Kommandos
// 1'2015 Sven Giermann
//
// Input-Datenpunkte:
//    77101:{
//        "name":     "...",                    // Name des zu erstellenden Datenpunktes
//        "type":     ["bool"|"int"|"float"],
//        "interval":  1000,                    // Ausfuehrungsinterval in ms
//        "command":  "..."                // Kommando zum Lesen des Wertes (Rueckgabe ueber stdout)
//    }
//
// Multi-Input-Datenpunkte:
//    77101:{
//        "name":     "...",                    // Name des zu erstellenden Datenpunktes
//        "type":     "multi",
//        "clients":  [77101, 77102],           // Anzahl Clients bestimmt die Anzahl erwarteter Zeichen
//        "interval":  1000,                    // Ausfuehrungsinterval in ms
//        "command":  "..."                // Kommando zum Lesen des Wertes (Rueckgabe ueber stdout)
//    },
//    77102:{                                   // Typ ist hier immer "bool", also 0 oder 1 aus stdout
//        "name":     "..."                     // Name des zu erstellenden Datenpunktes
//    },
//    77103:{
//        "name":     "..."                     // Name des zu erstellenden Datenpunktes
//    }

// zu oft gestartete/blockierende Prozesse finden:
//   ps -edfa f |grep ' \\_ /opt/ccu.io/tools/dlpio8.arm'|cut -b 9-15 | xargs kill

// Benutzer "pi" Zugriff auf serielle + USB-Schnittstellen geben:
//   usermod -a -G dialout pi

//////////////////////////////////////////////////////////////////////////////////////////////
//
// Konfiguration
//
var debugLogLevel = 3;

var externCmdId = 77100; // Channel Id

var externCmdDP = {
    77101:{
        name:     "Heizung.Brenner.Relais",
        type:     "bool",                     // out
        commands: {
          "_1":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -01",
          "_0":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -11"
        }
    },
    77102:{
        name:     "Heizung.Brauchwasser.Relais",
        type:     "bool",                     // out
        commands: {
          "_1":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -05",
          "_0":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB1 -15"
        }
    },
    77103:{
        name:     "Heizung.Fussboden.Relais",
        type:     "bool",                     // out
        commands: {
          "_1":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -02",
          "_0":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -12"
        }
    },
    77104:{
        name:     "Heizung.Heizkreis.Relais",
        type:     "bool",                     // out
        commands: {
          "_1":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -06",
          "_0":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -16"
        }
    },
    77105:{
        name:     "Heizung.Fussboden.Mischer",
        type:     "val",                      // out
        commands: {
          "_1":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -04 -13",
          "_0":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -03"
          "_-1":  "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -14 -13"
        }
    },
    77106:{
        name:     "Heizung.Heizkreis.Mischer",
        type:     "val",                      // out
        commands: {
          "_1":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -08 -17",
          "_0":   "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -07"
          "_-1":  "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB2 -18 -17"
        }
    },
//    77107:{
//        name:     "Heizung.Brenner.Status",
//        type:     "bool",                     // in
//        interval:  1000,
//        command:  "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB0 -i1"
//    },
    77107:{
        name:     "Heizung.Brenner.Status",
        type:     "multi",                    // in bool, erstes Zeichen: 0/1
        clients:  [77108, 77109, 77110],      // folgende Zeichen in diese IDs
        interval:  1000,
        command:  "/opt/ccu.io/tools/dlpio8.arm -d /dev/ttyUSB0 -b14"
    },
    77108:{ name: "Heizung.Fussboden.Status" },
    77109:{ name: "Heizung.Heizkreis.Status" },
    77110:{ name: "Heizung.Heizkreis.MischZu" }
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
    var cmd = externCmdDP[objectId].command;
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
        if (externCmdDP[data.id].type == "bool") {
            if (data.newState.value > 0)
                cmd = externCmdDP[data.id].commands["_1"];
            else
                cmd = externCmdDP[data.id].commands["_0"];
        } else
            cmd = externCmdDP[data.id].commands["_" + data.newState.value];
        logOutput(2, "[observeExternOut] " + data.name + " #" + data.id + " = " + data.newState.value + " --> " + cmd);

        // ggf. async starten (spawn), dann muessten die Parameter in eigenem Array stehen
        if (cmd) cp.exec(cmd, function(err, stdout, stderr) {
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

            if (externCmdDP[externCmd].command)
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
