# TxMEx
Transaction Message Exchange (TxMEx) is a service for Bitcore that allows to send and receive messages between the nodes of a Bitcoin network. 

The TxMEx service is mainly intended for the Testnet network and has never been tested on Mainnet.
Transactions has a minimum cost for both for the transferred value (546) and the fee (3000).
It is theoretically possible to use the service in the Mainnet by simply setting the Bitcore node accordingly. This use is however discouraged

See below for more details.

## Requirements
- bitcore-node
- bitcore-lib
- bitcore-explorers
- insight-api

## Set-up
If you already have a running Bitcore node, you can skip directly to TxMEx
### Bitcore
To install a Bitcore Full Node, you should refer to https://bitcore.io/guides/full-node/  
This is a short guide to install it on Debian-based OSs:
 * Install NVM: `wget https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash`
 * Install Node 4: `nvm install 4`
 * Install Requirements: `apt-get install npm libzmq3-dev build-essential curl`
 * Install Bitcore: `npm install -g bitcore`
 * Create your Bitcore full node: `bitcore create [--testnet] MY_NODE`
### TxMEx
 * From your node folder: `bitcore install insight-api txmex`

## Usage
In order to interact with the TxMEx (for short, TM) service, you can use the 'bitcore call' API command.

The available commands are:
- getnetstatus: returns nodes in the default TM network
- createnode: creates a new TM node;
  - Syntax: 'createnode NAME' ; if NAME=auto, the name will be choose automatically; if NAME=temp, the node won't be saved
- addnode: adds an existing Bitcoin node to the TM network; 
  - Syntax: 'addnode NAME PRIV_KEY' ; NAME follows the same rules as in 'createnode'
- removenode: removes a node from the TM network; 
  - Syntax: 'removenode NAME'
- getnodestatus: returns funds and in/out messages for a TM node; 
  - Syntax: 'getnodestatus NAME'
- sendmessage: sends a message from one TM node to another; 
  - Syntax: 'sendmessage SRC_ID DST_{NAME|ADDR} MESSAGE'
- getmessages: retrieves all TM messages for a TM node; 
  - Syntax: 'getmessages ID'
- waitmessage: wait for a new TM message for the local TM network; 
  - Syntax: 'waitmessage'
- waitmessagefrom: wait for a new TM message from a specific source address; 
  - Syntax: 'waitmessagefrom {ID|ADDR}'
- waitmessageto: wait for a new TM message to a specific source address; 
  - Syntax: 'waitmessageto ID'
  
### Update
If installed via NPM you can update it by typing `npm update txmex` from the `node_modules` folder of the Bitcore node you're using.

## TxMEx protocol details
Messages are splitted into chunks of 76 bytes, each of which is embedded into a transaction, through the OP_RETURN Script command.
Each transaction sends 546 satoshis (the minimum valid amount), and adds a fee of 3000 (a little higher than the minimum required by Bitcore).

The format of the message is:

| 'TM' | len | seq | message_chunk  |  
|. 0-1 .| . 2 . | . 3 . | ......... 4-79 ......... |

Once the TxMEx service recieves all chunks of a message it assembles them and notify the TM network with a 'bus event'.
The destination node will read the message and optionally take some actions.
The first 3 characters of the message are interpreted as a command.
Currently, only 2 commands are considered: 'png' and 'ack'; when a node receives a 'png' command, it will send back an 'ack' message.  
[In a future release, nodes will have the ability to load a 'rule set', defining their behavior]

## Limitations & Planned Improvements
- TxMEx does not encrypt private key, so they are currently stored in the clear on the hard drive;
- Nodes need funds to send messages. [It is planned to add an automatic faucet request, for Testnet];
- TxMEx currently support one network per-node [TxMEx design has been thought for multiple networks, so this limitation will be removed soon];
- Currently, transaction value and fee cannot be changed [It is planned to give the ability to change this values in a future release]
