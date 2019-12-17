const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const PHARMACY = "Pharmacy";
const PRESCRIPTION = "Prescription";
const USER = "User";

const jwt = require('jsonwebtoken');


const https = require('https');
const querystring = require('querystring');

function post_user(userSub){

    let key = datastore.key(USER);
    const new_user = {"sub": userSub};
    return datastore.save({"key":key, "data":new_user}).then(() => {return key});
  
}

function get_all_entities(type){
	const q = datastore.createQuery(type);
	return datastore.runQuery(q).then( (entities) => {
		return entities[0].map(ds.fromDatastore);
	});
}

let state = "";


router.get('/', function(req, res){

    let context = {};

    state = "";

  // Generate a random state variable (alpha-numeric) 25 characters long
  // Help with random number generation obtained from:
  // https://stackoverflow.com/questions/4959975/generate-random-number-between-two-numbers-in-javascript

  for(let i = 0; i < 25; i++) {
    let typeOfCharacter = Math.floor((Math.random() * 3) + 1);

    if(typeOfCharacter === 1) {     // Generate a random uppercase letter and add to state string
      let asciiValue = Math.floor((Math.random() * 26) + 1);
      asciiValue = asciiValue + 64;
      let characterToAdd = String.fromCharCode(asciiValue);
      state = state + characterToAdd;
    }

    else if(typeOfCharacter === 2) {    // Generate a random lowercase letter and add to state string
      let asciiValue = Math.floor((Math.random() * 26) + 1);
      asciiValue = asciiValue + 96;
      let characterToAdd = String.fromCharCode(asciiValue);
      state = state + characterToAdd;
    }

    else {      // Generate a random number character and add to state string
      let asciiValue = Math.floor((Math.random() * 10) + 1);
      asciiValue = asciiValue + 47;
      let characterToAdd = String.fromCharCode(asciiValue);
      state = state + characterToAdd;
    }
  }

    let endPointURL = 'https://dev-plsxev-m.auth0.com/authorize?' +
    'response_type=code&' +
    'client_id=WaXZPC8klI4IXDaquw0BDKfGN086p1yM&' +
    'redirect_uri=https://childrem-cs493-final-project.appspot.com/login/userInfo&' + 
    'scope=openid&' +
    'state=' + state;

    context.endpointURL = endPointURL;

    // Help saving variables for other handlers obtained from:
    // https://stackoverflow.com/questions/9765215/global-variable-in-app-js-accessible-in-routes

    

    res.render('welcome', context);
});


router.get('/userInfo', function(req, res){

    usedStateString = state 

    let context = {};

    if(req.query.error) {
        res.send(JSON.stringify({"Error": "Access Denied By User"}));
        res.end();
    }

    else if(req.query.state !== usedStateString) {
        res.send(JSON.stringify({"Error": "The state string returned did NOT match what was sent. Process Aborted"}));
        res.end();
    }

    else {  // State matched what we sent so we now ask for the token

        async function getToken(outterreq, finalRes) {

            // Send the data as application/x-www-form-urlencoded
            // Help setting up the code to send data in this way obtained from:
            // https://www.codexpedia.com/node-js/node-js-making-https-post-request-with-x-www-form-urlencoded-data/

            var postData = querystring.stringify({
                code: outterreq.query.code,
                client_id: "WaXZPC8klI4IXDaquw0BDKfGN086p1yM",
                client_secret: "YgM6UXRnt212KvFP5JLYAPKvK8cr5SurlqhkfDVuM7MGJ_9dZWcLWxhNweLy3dyR",
                redirect_uri: "https://childrem-cs493-final-project.appspot.com/login/userInfo",
                grant_type: "authorization_code"
            });

            var options = {
                host: 'dev-plsxev-m.auth0.com',
                path: '/oauth/token',
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': postData.length}
            };

            var req = https.request(options, function (res) {
                var result = '';
                res.on('data', function (chunk) {
                    result += chunk;
                });
    
                res.on('end', function () {
                    // Deal with returned response here
    
                    let formattedResult = JSON.parse(result);

                    // Help using the jsonwebtoken library obtained from:
                    // https://github.com/auth0/node-jsonwebtoken

                    var decoded = jwt.decode(formattedResult.id_token);

    
                    context.id_token = formattedResult.id_token;

                    // If this is a new user to the app, put them in the datastore database
                    const userList = get_all_entities(USER)
                    .then( (UserList) => {
                        let UserNameFound = false;
                        for (item of UserList) {
                            if(item.sub === decoded.sub) {
                                UserNameFound = true;
                            }
                        }

                        if (!UserNameFound) {       // This is a new user so need to add them to the database
                            post_user(decoded.sub)
                            .then( () => {
                                finalRes.render('userInfo', context);
                            });
                        }

                        else {
                            finalRes.render('userInfo', context);
                        }

                    });
                        
                });

                res.on('error', function (err) {
                    console.log(err);
                });

            });

            // send the request with our form data

            req.write(postData);
            req.end();

        }   // CLOSES TOKEN FXN

        getToken(req, res);

    }


});


module.exports = router;