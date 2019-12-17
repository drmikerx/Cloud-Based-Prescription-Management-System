// Michael Childress
// CS 493 Cloud Application Development
// Final Project

const express = require('express');
const bodyParser = require('body-parser');
const router = express.Router();

const ds = require('./datastore');

const datastore = ds.datastore;

const Joi = require('joi');

// Help with Joi obtained from:
// https://blog.softwaremill.com/javascript-data-validation-with-joi-99cdffb5dd57
// Help with regex expression obtained from:
// https://stackoverflow.com/questions/47873369/joi-validation-string-fails-on-and
// Name and address must be strings of numbers, letters, commas, apostrophes or spaces. Name must be between 1 and 100 characters
// Address must be between 1 and 500 characters
// Phone number will be stored as a string of numbers (and possibly dashes or spaces) between 10 and 12 characters

const createPharmacySchema = Joi.object().keys({
  name: Joi.string().regex(/^[', a-zA-Z0-9]+$/).min(1).max(100).required(),
  address: Joi.string().regex(/^[', a-zA-Z0-9]+$/).min(1).max(500).required(),
  phone_number: Joi.string().regex(/^[- 0-9]+$/).min(10).max(12).required()
});

const patchPharmacySchema = Joi.object().keys({
  name: Joi.string().regex(/^[', a-zA-Z0-9]+$/).min(1).max(100),
  address: Joi.string().regex(/^[', a-zA-Z0-9]+$/).min(1).max(500),
  phone_number: Joi.string().regex(/^[- 0-9]+$/).min(10).max(12)
});

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

router.use(bodyParser.json());

/* ------------- Begin Pharmacy Model Functions -------------------*/

function createSelf (req, id, type) {
  if(req.hostname === 'localhost') {
      return req.protocol + '://' + req.hostname + ':' + req.socket.localPort + '/' + type + '/' + id.toString(10);
  }
          
  else {
      return 'https://' + req.hostname + '/' + type + '/' + id.toString(10);
  }
  
}

function post_pharmacy(reqObject){

  let key = datastore.key(PHARMACY);
  const new_pharmacy = {"name": reqObject.name, "address": reqObject.address, "phone_number": reqObject.phone_number, "prescriptions": []};
  return datastore.save({"key":key, "data":new_pharmacy}).then(() => {return key});

}

function get_all_entities(type){
	const q = datastore.createQuery(type);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(ds.fromDatastore);
		});
}


function formatPrescriptionsForDisplay(req, listOfPrescriptions) {
  let formattedPrescriptionList = [];
  let objectToAdd = {};

  for(item of listOfPrescriptions) {
      objectToAdd.id = item.toString(10);
      objectToAdd.self = createSelf (req, item, "prescriptions");
      formattedPrescriptionList.push(objectToAdd);
      objectToAdd = {};
  }

  return formattedPrescriptionList;
}


function add_prescription_info_to_pharmacy(pharmacyId, prescriptionId) {

  const pharmacy_key = datastore.key([PHARMACY, parseInt(pharmacyId,10)]);
  return datastore.get(pharmacy_key)
  .then( (pharmacy) => {
      pharmacy[0].prescriptions.push(prescriptionId);
      return datastore.save({"key":pharmacy_key, "data":pharmacy[0]});
  });
  
}

function add_pharmacy_info_to_prescription(pharmacyId, prescriptionId) {

  const prescription_key = datastore.key([PRESCRIPTION, parseInt(prescriptionId,10)]);
  return datastore.get(prescription_key)
  .then( (prescription) => {
      prescription[0].pharmacy_filled_at = pharmacyId;
      return datastore.save({"key":prescription_key, "data":prescription[0]});
  });

}


async function delete_prescription_from_pharmacy(prescription_id, pharmacy_id) {

  const pharmacy_key = datastore.key([PHARMACY, parseInt(pharmacy_id,10)]);
  return datastore.get(pharmacy_key)
  .then( (pharmacyEntity) => {
      let newPrescriptionList = [];
      for(item of pharmacyEntity[0].prescriptions) {
          if (item !== prescription_id) {
              newPrescriptionList.push(item);
          }
      }

      pharmacyEntity[0].prescriptions = newPrescriptionList;

      return datastore.save({"key": pharmacy_key, "data": pharmacyEntity[0]});

  });
}


async function delete_pharmacy_from_prescription(prescription_id) {
  const prescription_key = datastore.key([PRESCRIPTION, parseInt(prescription_id,10)]);
  return datastore.get(prescription_key)
  .then( (prescriptionEntity) => {
      prescriptionEntity[0].pharmacy_filled_at = null;
      return datastore.save({"key": prescription_key, "data": prescriptionEntity[0]});
  });
}


// Using a datastore transaction allows us to update only attributes specified in the request

async function updateViaPatch(attributeList, pharmacyId) {

  const transaction = datastore.transaction();
  await transaction.run();

  const pharmacy_key = datastore.key([PHARMACY, parseInt(pharmacyId,10)]);

  const results = await Promise.all([
      transaction.get(pharmacy_key)
  ]);

  const pharmacyObject = results.map(result => result[0]);

  if(attributeList.name) {
      pharmacyObject[0].name = attributeList.name;
  }

  if(attributeList.address) {
      pharmacyObject[0].address = attributeList.address;
  }

  if(attributeList.phone_number) {
      pharmacyObject[0].phone_number = attributeList.phone_number;
  }

  transaction.save([
      {key: pharmacy_key, data: pharmacyObject[0]}
  ]);

  return transaction.commit();
}


async function updateViaPut(attributeList, pharmacyId) {

  const transaction = datastore.transaction();
  await transaction.run();

  const pharmacy_key = datastore.key([PHARMACY, parseInt(pharmacyId,10)]);

  const results = await Promise.all([
      transaction.get(pharmacy_key)
  ]);

  const pharmacyObject = results.map(result => result[0]);

  pharmacyObject[0].name = attributeList.name;
  pharmacyObject[0].address = attributeList.address;
  pharmacyObject[0].phone_number = attributeList.phone_number;

  transaction.save([
      {key: pharmacy_key, data: pharmacyObject[0]}
  ]);

  return transaction.commit();
}


function delete_pharmacy(id) {
  const pharmacy_key = datastore.key([PHARMACY, parseInt(id,10)]);
  return datastore.delete(pharmacy_key);
}


// Async function for performing promise related actions in a loop

async function removePharmacyFromPrescriptions(listOfPrescriptions) {

  const transaction = datastore.transaction();
  await transaction.run();

  for (currentPrescription of listOfPrescriptions) {
    let prescription_key = datastore.key([PRESCRIPTION, parseInt(currentPrescription,10)]);

    const results = await Promise.all([
      transaction.get(prescription_key)
    ]);

    const prescriptionObject = results.map(result => result[0]);

    prescriptionObject[0].pharmacy_filled_at = null;

    transaction.save([
      {key: prescription_key, data: prescriptionObject[0]}
    ]);
  }

  return transaction.commit();
}


// Pharmacy class constructor for presenting querry results for get all pharmacies

function reformattedPharmacy(origId, origName, origAddress, origPhoneNumber, origPrescriptions, req) {
  this.id = origId;
  this.name = origName;
  this.address = origAddress;
  this.phone_number = origPhoneNumber;
  this.prescriptions = origPrescriptions;
  this.self = createSelf(req, origId, 'pharmacies');
}


async function get_entity_count(type){
	const q = datastore.createQuery(type);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(ds.fromDatastore).length;
		});
}


async function get_pharmacies(req){
  var q = datastore.createQuery(PHARMACY).limit(5);
  const results = {};

  if(Object.keys(req.query).includes("cursor")){
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then( (entities) => {
    results.items = entities[0].map(ds.fromDatastore);

    const resultToReturn = {};
    resultToReturn.items = [];

    for(pharmacyEntity of results.items) {
      pharmacyEntity.prescriptions = formatPrescriptionsForDisplay(req, pharmacyEntity.prescriptions);
      resultToReturn.items.push(new reformattedPharmacy(pharmacyEntity.id, pharmacyEntity.name, pharmacyEntity.address, pharmacyEntity.phone_number, pharmacyEntity.prescriptions, req));
    }

    if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
      resultToReturn.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
    }

    return resultToReturn;

  });
}


/* ------------- End Model Functions ------------- */




/* ------------- Begin Pharmacy Controller Functions ------------- */


// Create a Pharmacy Entity (secured)

router.post('/', checkJwt, function(req, res){

  // Check that user has sent server JSON and that they are willing to accept JSON

  const accepts = req.accepts(['application/json']);

  if(!accepts) {
      res.status(406).send('Not Acceptable');
  }

  // Check that user sent their request in JSON format

  res.setHeader('Content-Type', 'application/json');

  if(req.get('content-type') !== 'application/json'){
      res.status(415).send(JSON.stringify({"Error": "Server only accepts application/json data"}));
  }

  if (!req.body.name || !req.body.address || !req.body.phone_number) {
    res.status(400).send(JSON.stringify({ "Error": "The request object is missing at least one of the required attributes" }));
  }

  let listOfAttributes = Object.keys(req.body);
  let badAttributeFound = false;

  for(item of listOfAttributes) {
    if(item !== "name" && item !== "address" && item !== "phone_number") {
        badAttributeFound = true;
    }
  }

  if(badAttributeFound) {
    res.status(400).send(JSON.stringify({"Error": "You sent an unrecognized pharmacy attribute"}));
  }

  else {  // Baseline validity checks passed. Now perform more thorough validation checks

    const validationResult = Joi.validate(req.body, createPharmacySchema);

    if (validationResult.error !== null) {
        res.status(400).send(JSON.stringify({"Error": "Request invalid"}));
    }

    else { // More advanced validity checks passed. Now make sure boat name is unique in the db

      const pharmacyList = get_all_entities(PHARMACY)
      .then( (pharmacyList) => {
        let pharmacyNameFound = false;
        for (item of pharmacyList) {
          if(item.name === req.body.name) {
              pharmacyNameFound = true;
          }
        }

        if(pharmacyNameFound) {
          res.status(403).send(JSON.stringify({"Error": "This pharmacy name has already been used. Pharmacy name MUST be unique"}));
        }

        else {  // Request has passed all our checks. Go ahead and add it to db
          post_pharmacy(req.body)
          .then( key => {res.status(201).send(JSON.stringify({"id": key.id, "name": req.body.name, "address": req.body.address, "phone_number": req.body.phone_number, "prescriptions": [], "self": createSelf(req, key.id, 'pharmacies')}) ) } );
        }

      });

    }

  }

});


// Get a specific pharmacy (UNsecured - a pharmacy is not "owned" by anyone)

router.get('/:pharmacy_id', function(req, res){

  // Check that user is ok receiving JSON response

  const accepts = req.accepts(['application/json']);

  if(!accepts) {
      res.status(406).send('Not Acceptable');
  }


  res.setHeader('Content-Type', 'application/json');

  // Check to make sure the pharmacy asked for exists

  const key = datastore.key([PHARMACY, parseInt(req.params.pharmacy_id,10)]);

  datastore.get(key, (err, entity) => {
        
    if (!entity) {
        res.status(404).send(JSON.stringify({"Error": "No pharmacy with this pharmacy_id exists"}));
    }

    else {
        res.status(200).send(JSON.stringify({"id": req.params.pharmacy_id, "name": entity.name, "address": entity.address, "phone_number": entity.phone_number, "prescriptions": formatPrescriptionsForDisplay(req, entity.prescriptions), "self": createSelf(req, req.params.pharmacy_id, 'pharmacies')}));
    }

  });

});


// Managing Prescriptions - Assign a prescription to the pharmacy that filled it
// Secured - only the owner of the specified prescription can assign the pharmacy that filled it

router.put('/:pharmacy_id/prescriptions/:prescription_id', checkJwt, function(req, res){

  // Make sure both the pharmacy and the prescription asked for exist

  const pharmacyKey = datastore.key([PHARMACY, parseInt(req.params.pharmacy_id,10)]);
  const prescriptionKey = datastore.key([PRESCRIPTION, parseInt(req.params.prescription_id,10)]);

  datastore.get(pharmacyKey, (err, pharmacyEntity) => {

    if (!pharmacyEntity) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send(JSON.stringify({"Error": "The specified pharmacy and/or prescription don\u2019t exist"}));
    }

    else {
      datastore.get(prescriptionKey, (err, prescriptionEntity) => {

        if (!prescriptionEntity) {
          res.setHeader('Content-Type', 'application/json');
          res.status(404).send(JSON.stringify({"Error": "The specified pharmacy and/or prescription don\u2019t exist"}));
        }

        else if (prescriptionEntity.patient !== req.user.sub) {
          res.setHeader('Content-Type', 'application/json');
          res.status(403).send(JSON.stringify({"Error": "This prescription is owned by someone else. Access Denied"}));
        }

        else {  // Both entities exist
          // Make sure prescription hasn't already been assigned to a pharmacy

          if (prescriptionEntity.pharmacy_filled_at !== null) {
            res.setHeader('Content-Type', 'application/json');
            res.status(403).send(JSON.stringify({"Error": "This prescription has already been assigned to a pharmacy"}));
          }

          else {
            // We are free to add the prescription to the pharmacy and vice versa
            add_prescription_info_to_pharmacy(req.params.pharmacy_id, req.params.prescription_id)
            .then( () => {
              add_pharmacy_info_to_prescription(req.params.pharmacy_id, req.params.prescription_id).then(res.status(204).end());
            });

          }

        }


      });
    }

  });

});


// Managing prescriptions - remove a pharmacy from a prescription
// Secured - only the owner of the specified prescription can remove the pharmacy that filled it

router.delete('/:pharmacy_id/prescriptions/:prescription_id', checkJwt, function(req, res){

  // Make sure both the pharmacy and the prescription asked for exist

  const pharmacyKey = datastore.key([PHARMACY, parseInt(req.params.pharmacy_id,10)]);
  const prescriptionKey = datastore.key([PRESCRIPTION, parseInt(req.params.prescription_id,10)]);

  datastore.get(pharmacyKey, (err, pharmacyEntity) => {

    if (!pharmacyEntity) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send(JSON.stringify({"Error": "The specified pharmacy and/or prescription don\u2019t exist"}));
    }

    else {
      datastore.get(prescriptionKey, (err, prescriptionEntity) => {

        if (!prescriptionEntity) {
          res.setHeader('Content-Type', 'application/json');
          res.status(404).send(JSON.stringify({"Error": "The specified pharmacy and/or prescription don\u2019t exist"}));
        }

        else if (prescriptionEntity.patient !== req.user.sub) {
          res.setHeader('Content-Type', 'application/json');
          res.status(403).send(JSON.stringify({"Error": "This prescription is owned by someone else. Access Denied"}));
        }

        else {  // Both entities exist
          // Make sure prescription is actually assigned to this pharmacy

          if (prescriptionEntity.pharmacy_filled_at !== req.params.pharmacy_id) {
            res.setHeader('Content-Type', 'application/json');
            res.status(403).send(JSON.stringify({"Error": "This prescription was not filled at this pharmacy"}));
          }

          else {
            // We are free to remove the prescription from the pharmacy and vice versa
            delete_prescription_from_pharmacy(req.params.prescription_id, req.params.pharmacy_id)
            .then( () => {
              delete_pharmacy_from_prescription(req.params.prescription_id).then(res.status(204).end());
            });

          }

        }

      });
    }

  });

});


// Edit a Pharmacy PATCH version ---------------------------------------------

router.patch('/:pharmacy_id', checkJwt, function(req, res){

  // Check that user has sent server JSON and that they are willing to accept JSON

  const accepts = req.accepts(['application/json']);

  if(!accepts) {
    res.status(406).send('Not Acceptable');
  }

  // Check that user sent their request in JSON format

  res.setHeader('Content-Type', 'application/json');

  if(req.get('content-type') !== 'application/json'){
    res.status(415).send(JSON.stringify({"Error": "Server only accepts application/json data"}));
  }

  if(req.body.id || req.body.prescriptions) {
    res.status(400).send(JSON.stringify({"Error": "You are not allowed to edit the value of id or prescriptions"}));
  }

  let listOfAttributes = Object.keys(req.body);
  let badAttributeFound = false;

  for(item of listOfAttributes) {
    if(item !== "name" && item !== "address" && item !== "phone_number") {
      badAttributeFound = true;
    }
  }

  if(badAttributeFound) {
    res.status(400).send(JSON.stringify({"Error": "You sent an unrecognized pharmacy attribute"}));
  }

  const validationResult = Joi.validate(req.body, patchPharmacySchema);

  if (validationResult.error !== null) {
    res.status(400).send(JSON.stringify({"Error": "Request invalid"}));
  }

  // Check to make sure the name entered is unique if present here

  else if(req.body.name) {

    const pharmacyList = get_all_entities(PHARMACY)
    .then( (pharmacyList) => {
      let pharmacyNameFound = false;
      for (item of pharmacyList) {
        if(item.name === req.body.name) {
          pharmacyNameFound = true;
        }
      }

      if(pharmacyNameFound) {
        res.status(403).send(JSON.stringify({"Error": "This pharmacy name has already been used. Pharmacy name MUST be unique"}));
      }

      else {  // Request has passed all our checks. Go ahead and update the db if id is valid
        const key = datastore.key([PHARMACY, parseInt(req.params.pharmacy_id,10)]);
        datastore.get(key, (err, entity) => {
          if (!entity) {
            res.status(404).send(JSON.stringify({"Error": "No pharmacy with this pharmacy_id exists"}));
          }

          else {
            updateViaPatch(req.body, req.params.pharmacy_id)
            .then( key => {
              res.setHeader('Location', createSelf(req, req.params.pharmacy_id, 'pharmacies'));
              res.status(303).send(JSON.stringify({"Success": "To view the edited pharmacy make a GET request to the URL specified in the Location Header of the response"}));
            });
          }
        });
      }

    });

  }

  else {  // no name was entered just update entity now if id is valid

    const key = datastore.key([PHARMACY, parseInt(req.params.pharmacy_id,10)]);
    datastore.get(key, (err, entity) => {
      if (!entity) {
        res.status(404).send(JSON.stringify({"Error": "No pharmacy with this pharmacy_id exists"}));
      }

      else {
        updateViaPatch(req.body, req.params.pharmacy_id)
        .then( key => {
          res.setHeader('Location', createSelf(req, req.params.pharmacy_id, 'pharmacies'));
          res.status(303).send(JSON.stringify({"Success": "To view the edited pharmacy make a GET request to the URL specified in the Location Header of the response"}));
        });
      }
    });
  }

});


// Edit a Pharmacy - PUT Version

router.put('/:pharmacy_id', checkJwt, function(req, res){

  // Check that user has sent server JSON and that they are willing to accept JSON

  const accepts = req.accepts(['application/json']);

  if(!accepts) {
    res.status(406).send('Not Acceptable');
  }

  // Check that user sent their request in JSON format

  res.setHeader('Content-Type', 'application/json');

  if(req.get('content-type') !== 'application/json'){
    res.status(415).send(JSON.stringify({"Error": "Server only accepts application/json data"}));
  }

  if (!req.body.name || !req.body.address || !req.body.phone_number) {
    res.status(400).send(JSON.stringify({ "Error": "The request object is missing at least one of the required attributes" }));
  }

  if(req.body.id || req.body.prescriptions) {
    res.status(400).send(JSON.stringify({"Error": "You are not allowed to edit the value of id or prescriptions"}));
  }

  let listOfAttributes = Object.keys(req.body);
  let badAttributeFound = false;

  for(item of listOfAttributes) {
    if(item !== "name" && item !== "address" && item !== "phone_number") {
      badAttributeFound = true;
    }
  }

  if(badAttributeFound) {
    res.status(400).send(JSON.stringify({"Error": "You sent an unrecognized pharmacy attribute"}));
  }

  const validationResult = Joi.validate(req.body, createPharmacySchema);  // The validation requirements are the same as creating a new boat

  if (validationResult.error !== null) {
    res.status(400).send(JSON.stringify({"Error": "Request invalid"}));
  }

  // Check to make sure the name entered is unique

  else {

    const pharmacyList = get_all_entities(PHARMACY)
    .then( (pharmacyList) => {
      let pharmacyNameFound = false;
      for (item of pharmacyList) {
        if(item.name === req.body.name) {
          pharmacyNameFound = true;
        }
      }

      if(pharmacyNameFound) {
        res.status(403).send(JSON.stringify({"Error": "This pharmacy name has already been used. Pharmacy name MUST be unique"}));
      }

      else {  // Request has passed all our checks. Go ahead and update the db if id is valid
        const key = datastore.key([PHARMACY, parseInt(req.params.pharmacy_id,10)]);
        datastore.get(key, (err, entity) => {
          if (!entity) {
            res.status(404).send(JSON.stringify({"Error": "No pharmacy with this pharmacy_id exists"}));
          }

          else {
            updateViaPut(req.body, req.params.pharmacy_id)
            .then( key => {
              res.setHeader('Location', createSelf(req, req.params.pharmacy_id, 'pharmacies'));
              res.status(303).send(JSON.stringify({"Success": "To view the edited pharmacy make a GET request to the URL specified in the Location Header of the response"}));
            });
          }
        });
      }

    });

  }
  
});


// Delete a Pharmacy. Any prescriptions assigned to that pharmacy need to have pharmacy_filled_at set to null
// Only registered users can delete a pharmacy (though noone really owns it)

router.delete('/:pharmacy_id', checkJwt, function(req, res){

  // Make sure pharmacy id is valid

  res.setHeader('Content-Type', 'application/json');

  const key = datastore.key([PHARMACY, parseInt(req.params.pharmacy_id,10)]);
  
  datastore.get(key, (err, entity) => {
      
    if (!entity) {
      res.status(404).send(JSON.stringify({"Error": "No pharmacy with this pharmacy_id exists"}));
    }

    else {
      // Pull out list of prescriptions

      if(entity.prescriptions.length === 0) {
        // If empty, just delete the pharmacy entity
        delete_pharmacy(req.params.pharmacy_id).then(res.status(204).end());
      }

      else {
        // Else pass the list of prescriptions to the async function, then delete pharmacy entity
        removePharmacyFromPrescriptions(entity.prescriptions)
        .then(delete_pharmacy(req.params.pharmacy_id))
        .then(res.status(204).end());

      }

    }

  });

});


// Get All Pharmacies (NOT SECURE)

router.get('/', function(req, res){

  // Make sure user can accept JSON

  const accepts = req.accepts(['application/json']);

  if(!accepts) {
    res.status(406).send('Not Acceptable');
  }

  else {

    const pharmacies = get_pharmacies(req)
	  .then( (pharmacies) => {
      get_entity_count(PHARMACY)
      .then( (count) => {
        pharmacies.total_number_in_collection = count;
        res.status(200).json(pharmacies);
      });
    
    });

  }

});


router.delete('/', function(req,res){
  res.setHeader('Allow', 'GET, POST');
  res.status(405).end();
});

router.put('/', function(req,res){
  res.setHeader('Allow', 'GET, POST');
  res.status(405).end();
});

router.patch('/', function(req,res){
  res.setHeader('Allow', 'GET, POST');
  res.status(405).end();
});

router.get('/:pharmacy_id/prescriptions/:prescription_id', function(req,res){
  res.setHeader('Allow', 'PUT, DELETE');
  res.status(405).end();
});

router.patch('/:pharmacy_id/prescriptions/:prescription_id', function(req,res){
  res.setHeader('Allow', 'PUT, DELETE');
  res.status(405).end();
});

/* ------------- End Controller Functions ------------- */


module.exports = router;