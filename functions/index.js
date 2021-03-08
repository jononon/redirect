const functions = require('firebase-functions');
var admin = require("firebase-admin");
const rp = require('request-promise');

admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.shortenURL = functions.https.onCall((data, context) => {
  if(context.auth == undefined) {
    return false;
  } else {
    return admin.database().ref("/shortenedURLs/" + data.key).once('value').then(snapshot => {
      if(snapshot.exists()) {
        return false;
      } else {
        admin.database().ref("/shortenedURLs/" + data.key).set(data.url);
        return true;
      }
    });
  }
});

exports.checkForConflict = functions.https.onCall((data, context) => {
  if(context.auth == undefined) {
    return false;
  } else {
    return admin.database().ref("/shortenedURLs/" + data.key).once('value').then(snapshot => {
      if(snapshot.exists()) {
        return true;
      } else {
        return false;
      }
    });
  }
});

function sendMessage(messageBody) {
  var messageOptions = {
    'method': 'POST',
    'url': 'https://api.twilio.com/2010-04-01/Accounts/AC124178576b17a1499b948f2af191b13b/Messages.json',
    'headers': {
      'Authorization': `Basic ${functions.config().twilio.authheaderkey}`
    },
    formData: {
      'Body': messageBody,
      'From': '+13238971709',
      'To': '+13109137582'
    }
  };
  return rp(messageOptions);
}

function sendTextAlert(key, location, region, country) {
  var message = `Redir :: Key ${key} :: Location ${location}, `;
  if(region != "") {
    message += `${region}, `;
  }
  message += country;
  return sendMessage(message);
}

exports.redirect = functions.https.onRequest((request, response) => {
  if(request.url == "/") { //Special case if there is no key passed (i.e. user just goes to jdami.co plain)
    var redirectURL = "https://jonathandamico.me"
    response.redirect(301, redirectURL);
    console.log("Redirected jdami.co/" + " to " + redirectURL);
    admin.database().ref("/analytics/jonathandamico-me/").push({
      requestTime: (new Date()).getTime(),
      headers: request.headers
    });
  } else {
    var key = request.url.substring(1);
    return admin.database().ref("/shortenedURLs/" + key).once('value').then(snapshot => {
      if(snapshot.exists()) {
        var redirectURL = snapshot.val();
        response.redirect(301, redirectURL);   
        console.log("Redirected jdami.co/" + key + " to " + redirectURL);
        admin.database().ref("/analytics/" + key).push({
          requestTime: (new Date()).getTime(),
          headers: request.headers
        });   
      } else {
        response.redirect(301, "https://jdami.co/404");
        console.log("Failed to redirect jdami.co/" + key + " . No key existed");
      }
    });
  }
});

exports.getIPInfo = functions.database.ref("/analytics/{key}/{instanceID}/").onCreate((snapshot, context) => {
  var original = snapshot.val();

  var options = {
    'method': 'GET',
    'url': 'http://ip-api.com/json/' + original["headers"]["fastly-client-ip"],
    'headers': {
    }
  };
  return rp(options).then(function (body){
    var jsonBody = JSON.parse(body);
    sendTextAlert(context.params.key, jsonBody.city, jsonBody.region, jsonBody.country);
    return admin.database().ref(`/analytics/${context.params.key}/${context.params.instanceID}/ipInfo/`).set(jsonBody);
  });

});

exports.getList = functions.https.onCall((data, context) => {
  if(context.auth == undefined) {
    return false;
  } else {
    return admin.database().ref("/shortenedURLs/").once("value").then(snapshot => {
      if(snapshot.exists()) {
        return snapshot.val();
      } else {
        return false;
      }
    });
  }
});

exports.removeShortlink = functions.https.onCall((data, context) => {
  if(context.auth == undefined) {
    return false;
  } else {
    var ref = admin.database().ref("/shortenedURLs/" + data.key);
    return ref.once("value").then(snapshot => {
      if(snapshot.exists()) {
        var oldURL = snapshot.val();
        console.log(oldURL);
        admin.database().ref("/analytics/" + data.key).remove();
        return ref.remove().then(function() {
          return oldURL;
        }).catch(function(error) {
          return false;
        });
      } else {
        return false;
      }
    });
  }
});