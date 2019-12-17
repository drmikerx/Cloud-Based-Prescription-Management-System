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
// rx_number is an integer and must be between 1 and the maximum value for an int
// med_name and usage_directions are strings of numbers, letters, commas, spaces, apostrophes, and dashes.  Must be between 1 and 5000 characters.

const createPrescriptionSchema = Joi.object().keys({
  rx_number: Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER).required(),
  med_name: Joi.string().regex(/^[-', a-zA-Z0-9]+$/).min(1).max(5000).required(),
  usage_directions: Joi.string().regex(/^[-', a-zA-Z0-9]+$/).min(1).max(5000).required()
});

const patchPrescriptionSchema = Joi.object().keys({
  rx_number: Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER),
  med_name: Joi.string().regex(/^[-', a-zA-Z0-9]+$/).min(1).max(5000),
  usage_directions: Joi.string().regex(/^[-', a-zA-Z0-9]+$/).min(1).max(5000)
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


/* ------------- Begin Prescription Model Functions ------------- */

function createSelf (req, id, type) {
  if(req.hostname === 'localhost') {
      return req.protocol + '://' + req.hostname + ':' + req.socket.localPort + '/' + type + '/' + id.toString(10);
  }
          
  else {
      return 'https://' + req.hostname + '/' + type + '/' + id.toString(10);
  }
  
}

function post_prescription(reqObject, owner){

  let key = datastore.key(PRESCRIPTION);
  const new_prescription = {"patient": owner, "pharmacy_filled_at": null, "rx_number": reqObject.rx_number, "med_name": reqObject.med_name, "usage_directions": reqObject.usage_directions};
  return datastore.save({"key":key, "data":new_prescription}).then(() => {return key});

}


// Using a datastore transaction allows us to update only attributes specified in the request

async function updateViaPatch(attributeList, prescriptionId) {

  const transaction = datastore.transaction();
  await transaction.run();

  const prescription_key = datastore.key([PRESCRIPTION, parseInt(prescriptionId,10)]);

  const results = await Promise.all([
      transaction.get(prescription_key)
  ]);

  const prescriptionObject = results.map(result => result[0]);

  if(attributeList.rx_number) {
      prescriptionObject[0].rx_number = attributeList.rx_number;
  }

  if(attributeList.med_name) {
      prescriptionObject[0].med_name = attributeList.med_name;
  }

  if(attributeList.usage_directions) {
      prescriptionObject[0].usage_directions = attributeList.usage_directions;
  }

  transaction.save([
      {key: prescription_key, data: prescriptionObject[0]}
  ]);

  return transaction.commit();
}


async function updateViaPut(attributeList, prescriptionId) {

  const transaction = datastore.transaction();
  await transaction.run();

  const prescription_key = datastore.key([PRESCRIPTION, parseInt(prescriptionId,10)]);

  const results = await Promise.all([
      transaction.get(prescription_key)
  ]);

  const prescriptionObject = results.map(result => result[0]);

  prescriptionObject[0].rx_number = attributeList.rx_number;
  prescriptionObject[0].med_name = attributeList.med_name;
  prescriptionObject[0].usage_directions = attributeList.usage_directions;

  transaction.save([
      {key: prescription_key, data: prescriptionObject[0]}
  ]);

  return transaction.commit();
}


function delete_prescription(id) {
  const prescription_key = datastore.key([PRESCRIPTION, parseInt(id,10)]);
  return datastore.delete(prescription_key);
}


async function deletePrescriptionFromPharmacy(prescription_id, pharmacy_id) {

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
          newPharmacyInfo.self = createSelf(req, currentPrescription.pharmacy_filled_at, "pharmacies");

          currentPrescription.pharmacy_filled_at = newPharmacyInfo;
      }

      currentPrescription.self = createSelf(req, currentPrescription.id, "prescriptions");
  }

  return listOfPrescriptions;
}


async function get_prescriptions(req){
  var q = datastore.createQuery(PRESCRIPTION).limit(5);
  const results = {};

  if(Object.keys(req.query).includes("cursor")){
    q = q.start(req.query.cursor);
  }

  return datastore.runQuery(q).then( (entities) => {
    results.items = entities[0].map(ds.fromDatastore);
    if(entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS ){
      results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
    }

    return results;

  });
}

async function get_entity_count(type){
	const q = datastore.createQuery(type);
	return datastore.runQuery(q).then( (entities) => {
			return entities[0].map(ds.fromDatastore).length;
		});
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

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

  if (!req.body.rx_number || !req.body.med_name || !req.body.usage_directions) {
    res.status(400).send(JSON.stringify({ "Error": "The request object is missing at least one of the required attributes" }));
  }

  let listOfAttributes = Object.keys(req.body);
  let badAttributeFound = false;

  for(item of listOfAttributes) {
    if(item !== "rx_number" && item !== "med_name" && item !== "usage_directions") {
        badAttributeFound = true;
    }
  }

  if(badAttributeFound) {
    res.status(400).send(JSON.stringify({"Error": "You sent an unrecognized prescription attribute"}));
  }


  else {  // Baseline validity checks passed. Now perform more thorough validation checks

    const validationResult = Joi.validate(req.body, createPrescriptionSchema);

    if (validationResult.error !== null) {
        res.status(400).send(JSON.stringify({"Error": "Request invalid"}));
    }

    else {  // Request has passed all our checks. Go ahead and add it to db
      post_prescription(req.body, req.user.sub)
      .then( key => {res.status(201).send(JSON.stringify({"id": key.id, "patient": req.user.sub, "pharmacy_filled_at": null, "rx_number": req.body.rx_number, "med_name": req.body.med_name, "usage_directions": req.body.usage_directions, "self": createSelf(req, key.id, 'prescriptions')}) ) } );
    }
  }

});


// Get a specific prescription (secured)

router.get('/:prescription_id', checkJwt, function(req, res){

  // Check that user is ok receiving JSON response

  const accepts = req.accepts(['application/json']);

  if(!accepts) {
      res.status(406).send('Not Acceptable');
  }


  res.setHeader('Content-Type', 'application/json');

  const key = datastore.key([PRESCRIPTION, parseInt(req.params.prescription_id,10)]);

  datastore.get(key, (err, entity) => {

    if (!entity) {
      res.status(404).send(JSON.stringify({"Error": "No prescription with this prescription_id exists"}));
    }

    else if (entity.patient !== req.user.sub) {
      res.status(403).send(JSON.stringify({"Error": "This prescription is owned by someone else. Access Denied"}));
    }

    else {  // Prescription exists and it's owned by this user. Go ahead and display it

      // Make sure formatting is correct

      if (entity.pharmacy_filled_at === null) {
        res.status(200).send(JSON.stringify({"id": req.params.prescription_id, "patient": entity.patient, "pharmacy_filled_at": entity.pharmacy_filled_at, "rx_number": entity.rx_number, "med_name": entity.med_name, "usage_directions": entity.usage_directions, "self": createSelf(req, req.params.prescription_id, 'prescriptions')}));
      }

      else {  // We need to get the name of the pharmacy from the database

        let pharmacyInfo = {};
        const pharmacy_key = datastore.key([PHARMACY, parseInt(entity.pharmacy_filled_at,10)]);
        return datastore.get(pharmacy_key)
        .then( (pharmacy) => {
          pharmacyInfo.id = entity.pharmacy_filled_at.toString(10);
          pharmacyInfo.name = pharmacy[0].name;
          pharmacyInfo.self = createSelf(req, entity.pharmacy_filled_at, "pharmacies");
          return pharmacyInfo;
        }).then((pharmacyInfo) => {
            res.status(200).send(JSON.stringify({"id": req.params.prescription_id, "patient": entity.patient, "pharmacy_filled_at": pharmacyInfo, "rx_number": entity.rx_number, "med_name": entity.med_name, "usage_directions": entity.usage_directions, "self": createSelf(req, req.params.prescription_id, 'prescriptions')}));
        });

      }
      
    }

  });

});


// Edit a Prescription PATCH version ---------------------------------------------

router.patch('/:prescription_id', checkJwt, function(req, res){

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

  if(req.body.id || req.body.patient || req.body.pharmacy_filled_at) {
    res.status(400).send(JSON.stringify({"Error": "You are not allowed to edit the value of id, patient, or pharmacy_filled_at"}));
  }

  let listOfAttributes = Object.keys(req.body);
  let badAttributeFound = false;

  for(item of listOfAttributes) {
    if(item !== "rx_number" && item !== "med_name" && item !== "usage_directions") {
      badAttributeFound = true;
    }
  }

  if(badAttributeFound) {
    res.status(400).send(JSON.stringify({"Error": "You sent an unrecognized prescription attribute"}));
  }

  const validationResult = Joi.validate(req.body, patchPrescriptionSchema);

  if (validationResult.error !== null) {
    res.status(400).send(JSON.stringify({"Error": "Request invalid"}));
  }


  else {  // user input was appropriate, just make sure the prescription they are asking for exists and that they own it

    const key = datastore.key([PRESCRIPTION, parseInt(req.params.prescription_id,10)]);
    datastore.get(key, (err, entity) => {
      if (!entity) {
        res.status(404).send(JSON.stringify({"Error": "No prescription with this prescription_id exists"}));
      }

      else if (entity.patient !== req.user.sub) {
        res.status(403).send(JSON.stringify({"Error": "This prescription is owned by someone else. Access Denied"}));
      }

      else {
        updateViaPatch(req.body, req.params.prescription_id)
        .then( key => {
          res.setHeader('Location', createSelf(req, req.params.prescription_id, 'prescriptions'));
          res.status(303).send(JSON.stringify({"Success": "To view the edited prescription make a GET request to the URL specified in the Location Header of the response"}));
        });
      }
    });
  }

});


// Edit a Prescription PUT Version ---------------------------------

router.put('/:prescription_id', checkJwt, function(req, res){

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

  if (!req.body.rx_number || !req.body.med_name || !req.body.usage_directions) {
    res.status(400).send(JSON.stringify({ "Error": "The request object is missing at least one of the required attributes" }));
  }

  if(req.body.id || req.body.patient || req.body.pharmacy_filled_at) {
    res.status(400).send(JSON.stringify({"Error": "You are not allowed to edit the value of id, patient, or pharmacy_filled_at"}));
  }

  let listOfAttributes = Object.keys(req.body);
  let badAttributeFound = false;

  for(item of listOfAttributes) {
    if(item !== "rx_number" && item !== "med_name" && item !== "usage_directions") {
      badAttributeFound = true;
    }
  }

  if(badAttributeFound) {
    res.status(400).send(JSON.stringify({"Error": "You sent an unrecognized prescription attribute"}));
  }

  const validationResult = Joi.validate(req.body, createPrescriptionSchema);  // The validation requirements are the same as creating a new prescription

  if (validationResult.error !== null) {
    res.status(400).send(JSON.stringify({"Error": "Request invalid"}));
  }


  else {  // Request has passed all our checks. Go ahead and update the db if id is valid and they own the prescription
    const key = datastore.key([PRESCRIPTION, parseInt(req.params.prescription_id,10)]);
    datastore.get(key, (err, entity) => {
      if (!entity) {
        res.status(404).send(JSON.stringify({"Error": "No prescription with this prescription_id exists"}));
      }

      else if (entity.patient !== req.user.sub) {
        res.status(403).send(JSON.stringify({"Error": "This prescription is owned by someone else. Access Denied"}));
      }

      else {
        updateViaPut(req.body, req.params.prescription_id)
        .then( key => {
          res.setHeader('Location', createSelf(req, req.params.prescription_id, 'prescriptions'));
          res.status(303).send(JSON.stringify({"Success": "To view the edited prescription make a GET request to the URL specified in the Location Header of the response"}));
        });
      }
    });
  }

});


// Delete a Prescription ------------------------------

router.delete('/:prescription_id', checkJwt, function(req, res){

  // Make sure the prescription is a valid one
  res.setHeader('Content-Type', 'application/json');

  const key = datastore.key([PRESCRIPTION, parseInt(req.params.prescription_id,10)]);
  
  datastore.get(key, (err, entity) => {
      
    if (!entity) {
      res.status(404).send(JSON.stringify({"Error": "No prescription with this prescription_id exists"}));
    }

    else if (entity.patient !== req.user.sub) {
      res.status(403).send(JSON.stringify({"Error": "This prescription is owned by someone else. Access Denied"}));
    }

    else {
      // Check the prescription's pharmacy_filled_at property
      if (entity.pharmacy_filled_at === null) {
        // If pharmacy_filled_at = null, then just delete the prescription entity from datastore
        delete_prescription(req.params.prescription_id).then(res.status(204).end());
      }

      else {
        // If pharmacy_filled_at has id, then retrieve the necessary pharmacy, find the prescription id and remove it from the list, update the pharmacy entity, then delete prescription entity
        deletePrescriptionFromPharmacy(req.params.prescription_id, entity.pharmacy_filled_at)
        .then( () => {
          delete_prescription(req.params.prescription_id).then(res.status(204).end());
        });
      }
    }

  });

});


// Get All Prescriptions (UNSECURED) -----------------------

router.get('/', function(req, res){

  // Make sure user can accept JSON

  const accepts = req.accepts(['application/json']);

  if(!accepts) {
    res.status(406).send('Not Acceptable');
  }

  else {

    res.setHeader('Content-Type', 'application/json');

    const prescriptions = get_prescriptions(req)
	  .then( (prescriptions) => {

      formatPharmaciesForDisplay(req, prescriptions.items)
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

/* ------------- End Controller Functions ------------- */

module.exports = router;