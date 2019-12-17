// Michael Childress
// CS 493 Cloud Application Development
// Final Project

const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();
const {Datastore} = require('@google-cloud/datastore');

const ds = require('./datastore');

const datastore = ds.datastore;


const USER = "User";
const PHARMACY = "Pharmacy";
const PRESCRIPTION = "Prescription";

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: 'https://dev-plsxev-m.auth0.com/.well-known/jwks.json'
    }),
    issuer: 'https://dev-plsxev-m.auth0.com/',
    algorithms: ['RS256']
});

function fromDatastore(item){
    item.id = item[Datastore.KEY].id;
    return item;
}

router.use(bodyParser.json());

/* ------------- Begin User Model Functions -------------------*/

function createSelf (req, id, type) {
    if(req.hostname === 'localhost') {
        return req.protocol + '://' + req.hostname + ':' + req.socket.localPort + '/' + type + '/' + id.toString(10);
    }
            
    else {
        return 'https://' + req.hostname + '/' + type + '/' + id.toString(10);
    }
    
}

function get_all_entities_specific_user(type, owner){
    const q = datastore.createQuery(type);
        return datastore.runQuery(q).then( (entities) => {
            return entities[0].map(fromDatastore).filter( item => item.patient === owner);
        });
}


async function formatPharmaciesForDisplay(req, listOfPrescriptions) {
    const transaction = datastore.transaction();
    await transaction.run();
  
    for(currentPrescription of listOfPrescriptions) {
        if(currentPrescription.pharmacy_filled_at !== null) {
            let pharmacy_key = datastore.key([PHARMACY, parseInt(currentPrescription.pharmacy_filled_at)]);
            const results = await Promise.all([
                transaction.get(pharmacy_key)
            ]);
  
            const pharmacyObject = results.map(result => result[0]);
  
            let newPharmacyInfo = {};
            newPharmacyInfo.id = currentPrescription.pharmacy_filled_at.toString(10);
            newPharmacyInfo.name = pharmacyObject[0].name;
            newPharmacyInfo.address = pharmacyObject[0].address;
            newPharmacyInfo.phone_number = pharmacyObject[0].phone_number;
            newPharmacyInfo.self = createSelf(req, currentPrescription.pharmacy_filled_at, "pharmacies");
  
            currentPrescription.pharmacy_filled_at = newPharmacyInfo;
        }
  
        currentPrescription.self = createSelf(req, currentPrescription.id, "prescriptions");
    }
  
    return listOfPrescriptions;
}


async function get_entity_count(type){
	const q = datastore.createQuery(type);
	return datastore.runQuery(q).then( (entities) => {
		return entities[0].map(ds.fromDatastore).length;
	});
}

/* ------------- End Model Functions ------------- */




/* ------------- Begin User Controller Functions ------------- */

router.get('/:user_id/prescriptions', checkJwt, function(req, res){

    // Make sure user will accept JSON as response

    const accepts = req.accepts(['application/json']);

    if(!accepts) {
      res.status(406).send('Not Acceptable');
    }

    res.setHeader('Content-Type', 'application/json');

    if (req.params.user_id !== req.user.sub) {
        res.status(401).send(JSON.stringify({"Error": "The user_id supplied in URL did not match JWT 'sub' property value"}));
    }
    
    else {

        const prescriptions = get_all_entities_specific_user(PRESCRIPTION, req.user.sub)
          .then( (prescriptions) => {
            formatPharmaciesForDisplay(req, prescriptions)
            .then( (updatedPharmacyList) => {
                prescriptions.items = updatedPharmacyList;
                get_entity_count(PRESCRIPTION)
                .then( (count) => {
                  prescriptions.total_number_in_collection = count;
                  res.status(200).json(prescriptions);
                });
            });
          
        });
    }


});


router.delete('/:user_id/prescriptions', function(req,res){
    res.setHeader('Allow', 'GET');
    res.status(405).end();
});

router.put('/:user_id/prescriptions', function(req,res){
    res.setHeader('Allow', 'GET');
    res.status(405).end();
});

router.patch('/:user_id/prescriptions', function(req,res){
    res.setHeader('Allow', 'GET');
    res.status(405).end();
});

router.post('/:user_id/prescriptions', function(req,res){
    res.setHeader('Allow', 'GET');
    res.status(405).end();
});


/* ------------- End Controller Functions ------------- */


module.exports = router;