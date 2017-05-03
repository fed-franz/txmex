# TxMEx
Transaction Message Exchange (TxMEx) is a service for Bitcore that allows to send and receive messages between the nodes of a Bitcoin network

## Requirements
- bitcore-lib
- bitcore-explorers
- insight-api

## Set-up
 * Install NVM: `wget https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash`
 * Install Node 4: `nvm install 4`
 * Install NPM: `apt-get install npm`
 * Install Bitcore requirements: `apt-get install libzmq3-dev build-essential curl`
 * Install Bitcore: `npm install -g bitcore`
 * Create your Bitcore full node: `bitcore create [--testnet] MY_NODE`
 * Install bitcore-explorers and insight-api. From your node folder: `bitcore install insight-api; npm install bitcore-explorers`
 * Install bitmex: `bitcore-node add txmex` (https://www.npmjs.com/package/txmex)
 * Add "txmex" to the "services" in 'bitcore-node.json' configuration file in the Bitcore node folder. Optionally you can add the "web" service if you plan to use the web APIs.


## Usage
In order to interact with the TxMEx service, you can use the 'bitcore call' API command.

The available commands are:
- getnetstatus: returns the Nodes in the network
- addnode: adds an existing Bitcoin node to the TM network; SYNTAX: 'addnode NAME PRIV_KEY'
- createnode: creates a new TM node; SYNTAX: 'createnode NAME'
- removenode: removes a node from the TM network; SYNTAX: 'removenode NAME'
- getnodestatus: returns funds and in/out messages for a TM node; SYNTAX: 'getnodestatus NAME'
- sendmessage: sends a message from one TM node to another; SYNTAX: 'sendmessage NAME {NAME|ADDR} MESSAGE'
- getmessages: retrieves all TM messages for a TM node; ; SYNTAX: 'getmessages NAME'
- waitmessage: wait for a new TM message for the local TM network; SYNTAX: 'waitmessage'
- waitmessagefrom: wait for a new TM message from a specific source address; SYNTAX: 'waitmessagefrom {NAME|ADDR}'
- waitmessageto: wait for a new TM message to a specific source address; SYNTAX: 'waitmessage NAME'

## TxMEx protocol details
Messages are splitted into chunks, each of which is embedded into a transaction, through the OP_RETURN Script command.
Each transaction sends 546 satoshis (the minimum valid amount), and adds a fee of 3000 (a little higher than the minimum required by Bitcore).

The format of the message is:

|. 0-1 .| . 2 . | . 3 . | ......... 4-79 ......... |

| 'TM' | len | seq | message_chunk  |

## Limitations
- TxMEx does not encrypt private key, so they are currently stored in clear on the hard drive
- Nodes need funds to send messages. (I plained to add an automatica faucet request, for Testnet)
- TxMEx currently support one network per-node (but its design allows to handle multiple ones, so it will be implemented soon)
