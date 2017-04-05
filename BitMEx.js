var BMNode = require('./BMNode')
var BMNet = require('./BMNet')

//TODO: printUsage
//TODO: option -testnet
//TODO: option -noname: does not assign a name; use its addr instead
//TODO: (cmd) getmessages, getmessage

var args = process.argv.slice(2);
var cmd = args[0]
var arg1 = args[1]
var arg2 = args[2]
var arg3 = args[3]
var arg4 = args[4]

switch (cmd) {
  /* addnode: add an existing node to the service */
  case 'addnode':
    var name = arg1
    if(!name){ //{TODO: assign random name} ?
       console.log("Syntax: newnode [NAME]"); process.exit(0);
    }

    // options = {network: 'testnet'}
    createBMNode(name);
    break;

  /* createnode: create a new node from scratch */
  case 'createnode':
    var name = arg1
    if(!name){ //{TODO: assign random name} ?
       console.log("Syntax: newnode [NAME]"); process.exit(0);
    }

    // options = {network: 'testnet'}
    createBMNode(name);
    break;

  case 'getstatus':
    var name = arg1
    if(!name){
       console.log("Syntax: getstatus [NAME]"); process.exit(0);
    }

    getNodeStatus(name);
    break;

  case 'sendmessage':
    if(!arg3){
       console.log("Syntax: sendmessage SOURCE DEST MESSAGE [SIGN_KEY]"); process.exit(0);
    }
    var source = arg1
    var dest = arg2
    var msg = arg3
    var key = arg4

    sendMessage(source, dest, msg)

    break;

  default:
    console.log("Syntax: CMD [ARGS]");
    console.log("Commands: 'newnode'");
}
