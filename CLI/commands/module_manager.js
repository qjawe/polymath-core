// Libraries for terminal prompts
var readlineSync = require('readline-sync');
var chalk = require('chalk');
var common = require('./common/common_functions');

// Generate web3 instance
const Web3 = require('web3');
if (typeof web3 !== 'undefined') {
    web3 = new Web3(web3.currentProvider);
} else {
    web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
}

let defaultGasPrice;

// Load contract artifacts
var contracts = require('./helpers/contract_addresses');
var abis = require('./helpers/contract_abis');

let securityTokenRegistry;
let securityToken;
let polyToken;

// Init user address variables
let Issuer;
let User;

// Init token info
let STSymbol;
let STAddress;
let STDetails;
let validSymbol = false;
let mintingFinished;

// Init Module Info
let pmModules;
let tmModules;
let stoModules;
let cpModules;
let numPM;
let numTM;
let numSTO;
let numCP;

async function setup() {
    try {
        let securityTokenRegistryAddress = await contracts.securityTokenRegistry();
        let securityTokenRegistryABI = abis.securityTokenRegistry();
        securityTokenRegistry = new web3.eth.Contract(securityTokenRegistryABI, securityTokenRegistryAddress);
        securityTokenRegistry.setProvider(web3.currentProvider);
    
        let polytokenAddress = await contracts.polyToken();
        let polytokenABI = abis.polyToken();
        polyToken = new web3.eth.Contract(polytokenABI, polytokenAddress);
        polyToken.setProvider(web3.currentProvider);
    }catch(err){
        console.log(err);
        console.log(chalk.red(`There was a problem getting the contracts. Make sure they are deployed to the selected network.`));
        process.exit();
    }
}

// Start function
async function executeApp() {
    await setup();

    common.logAsciiBull();
    console.log(chalk.yellow(`******************************************`));
    console.log(chalk.yellow(`Welcome to the Command-Line Module Manager`));
    console.log(chalk.yellow(`******************************************`));

    // Init user accounts
    let accounts = await web3.eth.getAccounts();
    Issuer = accounts[0];
    User = Issuer;
    defaultGasPrice = common.getGasPrice(await web3.eth.net.getId());

    await showUserInfo(User);

    while (!validSymbol) {
        await getSecurityToken();
    }
};

// get token contract based on input symbol
async function getSecurityToken() {
    STSymbol = readlineSync.question(chalk.yellow(`\nEnter the symbol of the registered security token you issued: `));
    STAddress = await securityTokenRegistry.methods.getSecurityTokenAddress(STSymbol).call({from: User});
    if (STAddress == "0x0000000000000000000000000000000000000000") {
        console.log(chalk.red(`\nToken symbol provided is not a registered Security Token. Please enter another symbol.`));
        return;
    }
    STDetails = await securityTokenRegistry.methods.getSecurityTokenData(STAddress).call({from: User});
    if (STDetails[1] != User) {
        console.log(chalk.red(`\nYou did not issue the Security Token associated with the symbol provided. Please enter another symbol.`));
        return;
    }
    validSymbol = true;
    let securityTokenABI = abis.securityToken();
    securityToken = new web3.eth.Contract(securityTokenABI, STAddress);

    await displayModules();

}

// display module status
async function displayModules() {

    await showUserInfo(User);

    // Security Token details
    let displayTokenSymbol = await securityToken.methods.symbol().call({from: User});
    let displayTokenSupply = await securityToken.methods.totalSupply().call({from: User});
    let displayUserTokens = await securityToken.methods.balanceOf(User).call({from: User});

    console.log(`
    **************    Security Token Information    ***************
    - Address:           ${STAddress}
    - Token symbol:      ${displayTokenSymbol.toUpperCase()}
    - Total supply:      ${web3.utils.fromWei(displayTokenSupply)} ${displayTokenSymbol.toUpperCase()}
    - User balance:      ${web3.utils.fromWei(displayUserTokens)} ${displayTokenSymbol.toUpperCase()}
    `);

    // Module Details
    pmModules = await iterateModules(1);
    tmModules = await iterateModules(2);
    stoModules = await iterateModules(3);
    cpModules = await iterateModules(4);

    // function ModuleInfo(_name, _moduleType, _address, _locked, _paused, _abi, _contract) {
    //     this.name = _name;
    //     this.type = _moduleType;
    //     this.address = _address;
    //     this.locked = _locked;
    //     this.paused = _paused;
    //     this.abi = _abi;
    //     this.contract = _contract;
    // }

    // Module Counts
    numPM = pmModules.length;
    numTM = tmModules.length;
    numSTO = stoModules.length;
    numCP = cpModules.length;

    console.log(`
    ******************    Module Information    *******************
    - Permission Manager:   ${(numPM > 0) ? numPM : 'None'}
    - Transfer Manager:     ${(numTM > 0) ? numTM : 'None'}
    - STO:                  ${(numSTO > 0) ? numSTO : 'None'}
    - Checkpoint:           ${(numCP > 0) ? numCP : 'None'}
    `);

    if (numPM) {
        console.log(chalk.green(`\n    Permission Manager Modules:`));
        for (i=0;i<numPM;i+=1) {
            console.log(`    - ${pmModules[i].name} is ${(pmModules[i].locked)?'Locked':'Unlocked'} at ${pmModules[i].address}`);
        }
    }

    if (numTM) {
        console.log(chalk.green(`\n    Transfer Manager Modules:`));
        for (i=0;i<numTM;i+=1) {
            console.log(`    - ${tmModules[i].name} is ${(tmModules[i].locked)?'Locked':'Unlocked'} and ${(tmModules[i].paused)?'Paused':'Unpaused'} at ${tmModules[i].address}`);
        }
    }

    if (numSTO) {
        console.log(chalk.green(`\n    STO Modules:`));
        for (i=0;i<numSTO;i+=1) {
            console.log(`    - ${stoModules[i].name} is ${(stoModules[i].locked)?'Locked':'Unlocked'} and ${(stoModules[i].paused)?'Paused':'Unpaused'} at ${stoModules[i].address}`);
        }
    }

    if (numCP) {
        console.log(chalk.green(`\n    Checkpoint Modules:`));
        for (i=0;i<numCP;i+=1) {
            console.log(`    - ${cpModules[i].name} is ${(cpModules[i].locked)?'Locked':'Unlocked'} at ${cpModules[i].address}`);
        }
    }
    selectAction();
}

async function iterateModules(_moduleType) {

    function ModuleInfo(_name, _moduleType, _address, _locked, _paused, _abi, _contract) {
        this.name = _name;
        this.type = _moduleType;
        this.address = _address;
        this.locked = _locked;
        this.paused = _paused;
        this.abi = _abi;
        this.contract = _contract;
    }

    let modules = [];
    let counter = 0;
    let endModule = false;
    let details;

    while (!endModule) {
        try {
            details = await securityToken.methods.getModule(_moduleType,counter).call({from: User});
            if (details[1] != "0x0000000000000000000000000000000000000000") {
                let nameTemp = web3.utils.hexToUtf8(details[0]);
                let abiTemp = JSON.parse(require('fs').readFileSync(`./build/contracts/${nameTemp}.json`).toString()).abi;
                let contractTemp = new web3.eth.Contract(abiTemp, details[1]);
                let pausedTemp = false;
                if (_moduleType == 2 || _moduleType == 3) {
                    let pausedTemp = await contractTemp.methods.paused().call({from: User});
                }
                modules.push(new ModuleInfo(nameTemp,_moduleType,details[1],details[2],pausedTemp,abiTemp,contractTemp));
                counter += 1;
            } else {
                endModule = true;
            }
        } catch(error) {
            endModule = true
        }
    }
    return modules;
}

async function selectAction() {
    let options = ['Add a module','Pause / unpause a module','Remove a module','Change module budget','Whitelist an address for a year','Mint tokens','End minting for Issuer','End minting for STO','Exit'];
    let index = readlineSync.keyInSelect(options, chalk.yellow('What do you want to do?'), {cancel: false});
    console.log("\nSelected:",options[index]);
    switch (index) {
        case 0:
            await addModule();
            break;
        case 1:
            await pauseModule();
            break;
        case 2:
            await removeModule();
            break;
        case 3:
            await changeBudget();
            break;
        case 4:
            await whitelist();
            break;
        case 5:
            await mintTokens();
            break;
        case 6:
            await endMintingForIssuer();
            break;
        case 7:
            await endMintingForSTO();
            break;
        case 8:
            process.exit();
    }
    displayModules()
}

function backToMenu() {
    let options = ['Return to Menu','Exit'];
    let index = readlineSync.keyInSelect(options, chalk.yellow('What do you want to do?'), {cancel: false});
    switch (index) {
        case 0:
            break;
        case 1:
            process.exit();
    }
}

// Actions
async function addModule() {
    console.log(chalk.red(`
    *********************************
    This option is not yet available.
    *********************************`));
    backToMenu();
}

async function pauseModule() {
    console.log(chalk.red(`
    *********************************
    This option is not yet available.
    *********************************`));
    backToMenu();
}

async function removeModule() {

    function ModuleInfo(_module, _index) {
        this.module = _module;
        this.index = _index;
    }
    let options = [];
    let modules = [];

    function pushModules(_numModules, _arrayModules) {
        if (_numModules > 0) {
            for (i=0;i<_numModules;i+=1) {
                options.push(_arrayModules[i].name);
                modules.push(new ModuleInfo(_arrayModules[i],i));
            }
        }
    }

    pushModules(numPM,pmModules);
    pushModules(numTM,tmModules);
    pushModules(numSTO,stoModules);
    pushModules(numCP,cpModules);

    let index = readlineSync.keyInSelect(options, chalk.yellow('Which module whould you like to remove?'));
    if (index != -1) {
        console.log("\nSelected: ",options[index]);
        let removeModuleAction = securityToken.methods.removeModule(modules[index].module.type,modules[index].index);
        let GAS = await common.estimateGas(removeModuleAction, User, 2);
        await removeModuleAction.send({from: User, gas: GAS, gasPrice: defaultGasPrice })
        .on('receipt', function(receipt){
            console.log(chalk.green(`\nSuccessfully removed ${modules[index].module.name}.`));
        });
    }
    backToMenu()
}

async function changeBudget() {
    console.log(chalk.red(`
    *********************************
    This option is not yet available.
    *********************************`));
    backToMenu();
}

async function whitelist() {
    try {
        let generalTransferManager = tmModules[0].contract;
        let investor = readlineSync.question(chalk.yellow(`Enter the address to be whitelisted: `));
        let now = await latestTime();
        let modifyWhitelistAction = generalTransferManager.methods.modifyWhitelist(investor, now, now, now + 31556952, true);
        let GAS = await common.estimateGas(modifyWhitelistAction, User, 1.2);
        await modifyWhitelistAction.send({ from: User, gas: GAS, gasPrice: defaultGasPrice })
        .on('receipt', function(receipt){
            console.log(chalk.green(`\nWhitelisting successful for ${investor}.`));
        });
    } catch (e) {
        console.log(e);
        console.log(chalk.red(`
    *************************
    Whitelist is not possible - Please make sure GeneralTransferManager is attached
    *************************`));
    }
    backToMenu();
}

async function mintTokens() {
    let _flag = await securityToken.methods.finishedIssuerMinting().call();
    if (_flag) {
        console.log(chalk.red("Minting is not possible - Minting has been permanently disabled by issuer"));
        return;
    }
    let result = await securityToken.methods.getModule(3, 0).call({from: Issuer});
    let isSTOAttached = result[1] != "0x0000000000000000000000000000000000000000";
    if (isSTOAttached) {
        console.log(chalk.red("Minting is not possible - STO is attached to Security Token"));
        return;
    }
    
    let _investor = readlineSync.question(chalk.yellow(`Enter the address to receive the tokens: `));
    let _amount = readlineSync.question(chalk.yellow(`Enter the amount of tokens to mint: `));
    try {
        let mintAction = securityToken.methods.mint(_investor, web3.utils.toWei(_amount));
        let GAS = await common.estimateGas(mintAction, User, 1.2);
        await mintAction.send({ from: User, gas: GAS, gasPrice: defaultGasPrice })
        .on('receipt', function(receipt){
            console.log(chalk.green(`\nMinting Successful.`));
        });
    } catch (e) {
        console.log(e);
        console.log(chalk.red(`
    **************************
    Minting was not successful - Please make sure beneficiary address has been whitelisted
    **************************`));
    }
    
    backToMenu()
}

async function endMintingForSTO() {
    let finishMintingSTOAction = securityToken.methods.finishMintingSTO();
    let GAS = await common.estimateGas(finishMintingSTOAction, User, 1.2);
    await finishMintingSTOAction.send({ from: User, gas: GAS, gasPrice: defaultGasPrice })
    .on('receipt', function(receipt){
        console.log(chalk.green(`\nEnd minting for STO was successful.`));
    });
    backToMenu();
}

async function endMintingForIssuer() {
    let finishMintingIssuerAction = securityToken.methods.finishMintingIssuer();
    let GAS = await common.estimateGas(finishMintingIssuerAction, User, 1.2);
    await finishMintingIssuerAction.send({ from: User, gas: GAS, gasPrice: defaultGasPrice })
    .on('receipt', function(receipt){
        console.log(chalk.green(`\nEnd minting for Issuer was successful.`));
    });
    backToMenu();
}

// Helpers
async function latestTime() {
    let block = await web3.eth.getBlock('latest')
    return block.timestamp;
}

async function showUserInfo(_user) {
    console.log(`
    *******************    User Information    ********************
    - Address:           ${_user}
    - POLY balance:      ${await polyBalance(_user)}
    - ETH balance:       ${web3.utils.fromWei(await web3.eth.getBalance(_user))}
    `);
}

async function polyBalance(_user) {
    let balance = await polyToken.methods.balanceOf(_user).call(({from: User}));
    return web3.utils.fromWei(balance);
}

module.exports = {
    executeApp: async function() {
          return executeApp();
      }
}
