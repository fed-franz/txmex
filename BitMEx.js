var BMNode = require('./BMNode')
var BMNet = require('./BMNet')
var argv = require('minimist')(process.argv.slice(2));

//TODO: option -testnet
//TODO: option -noname: does not assign a name; use its addr instead
//TODO: (cmd) getmessages, getmessage

function printUsage(message){
  if(message){
    console.log("ERROR");
    console.log("USAGE"+message);
  }
  else{
    console.log("USAGE: node BitMEx CMD OPTIONS \n"+
    " CMD: help|addnode|getmessages|sendmessage \n"+
    " OPTIONS: \n\
    -t, --testnet                   Use testnet network \n\
    -a, --address <ADDR>            Bitcoin address\n\
    -n, --name <NAME>               Node name\n\
    -k, --privkey <PRIV_KEY_WIF>    Save node's private key\n\
    -h                              Print help message\n\
    ");
  }

 process.exit(0)
}

const cmd = process.argv[2]
const addr = (argv.a ? argv.a : argv.address)
const name = (argv.n ? argv.n : argv.name)
const privk = (argv.pk ? argv.pk : argv.privkey)
const testnet = (argv.t ? argv.a : argv.testnet)

console.log("name:"+name);
process.exit()

switch (cmd) {
  case 'help':
    printUsage()
    break;

  case 'addnode':
    if(argv.h)
      printUsage("addnode [-a ADDRESS] [-n NAME] [-k PRIVATE_KEY_WIF] [-t]")
      //NO addr -> creates new addr; NO name -> a new name is chosen dynamically

    BMNet.addBMNode(addr, name, privk);
    break;

  case 'createnetwork':
//TODO    BMNet.createBMNet()
    break;

  case 'getstatus':
    if(!name){
       console.log("Syntax: getstatus [NAME]"); process.exit(0);
    }
//TODO getStatus(name) //if NO name return Network status
    getNodeStatus(name);
    break;

  case 'getmessages':
    //TODO
    break;

  case 'sendmessage':
  //TODO: SOURCE may be unknown, so one can use the
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
