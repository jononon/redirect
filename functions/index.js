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

exports.shortenURLs = functions.https.onCall((data, context) => {
  if(context.auth == undefined) {
    return false;
  } else {
    var keys = [];
    return admin.database().ref("/shortenedURLs/").once('value').then(snapshot => {
      for (var i = 0; i < data.urls.length; i++) {
        var key;
        do {
          key = makeId(8);
        } while(snapshot.val() == undefined ? false : snapshot.val()[key] != undefined);
        admin.database().ref("/shortenedURLs/" + key).set(data.urls[i]);
        keys.push("https://go.kiru.com/?r="+key);
      }
      return keys;
    });
  }
});

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

exports.redirect = functions.https.onRequest((request, response) => {
  var key = request.url.substring(1);
  return admin.database().ref("/shortenedURLs/" + key).once('value').then(snapshot => {
    if(snapshot.exists()) {
      var redirectURL = snapshot.val();
      response.redirect(301, redirectURL);   
      console.log("Redirected go.kiru.com/" + key + " to " + redirectURL);
      admin.database().ref("/analytics/" + key).push({
        requestTime: (new Date()).getTime(),
        headers: request.headers
      });   
    } else {
      response.redirect(301, "https://go.kiru.com/404");
      console.log("Failed to redirect go.kiru.com/" + key + " . No key existed");
    }
  });
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
    return admin.database().ref(`/analytics/${context.params.key}/${context.params.instanceID}/ipInfo/`).set(JSON.parse(body));
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