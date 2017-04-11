var BMNode = require('./BMNode')
var BMNet = require('./BMNet')

const cmd = process.argv[2]
var argv = require('minimist')(process.argv.slice(3));
var args = argv._

// console.log(argv._);
// process.exit(0)
//TODO: option -noname: does not assign a name; use its addr instead
//TODO: (cmd) getmessages, getmessage

function printUsage(message){
  if(message){
    // console.log("ERROR");
    console.log("USAGE: "+message);
  }
  else{
    console.log("USAGE: node BitMEx CMD OPTIONS \n"+
    " CMD: help|addnode|getmessages|sendmessage \n"+
    " OPTIONS: \n\
    -t, --testnet                   Use testnet network \n\
    -a, --address <ADDR>            Bitcoin address\n\
    -s, --source <ADDR>             Source node name\n\
    -n, --name <NAME>               Node name\n\
    -k, --privkey <PRIV_KEY_WIF>    Save node's private key\n\
    -h                              Print help message\n\
    ");
  }

 process.exit(0)
}

const addr = (argv.a ? argv.a : argv.address)
const name = (argv.n ? argv.n : argv.name)
const privk = (argv.pk ? argv.pk : argv.privkey)
const testnet = (argv.t ? argv.a : argv.testnet)

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
    var source = argv.s
    var dest = argv._[0]
    var msg = argv._[1]
    var key = argv.k

    if(!dest || !msg || argv.h){
      //TODO: Explain how to use it
      //TODO: SOURCE may be unknown, so one can use the address
      printUsage("sendmessage DEST_ADDRESS MESSAGE \
      [-s SOURCE_NODE | -a SOURCE_ADDRESS] [-k PRIV_KEY]")
    }

    BMNet.sendMessage(source, dest, msg, key)
    break;

  default:
    printUsage();
}
