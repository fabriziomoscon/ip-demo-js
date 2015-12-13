var util = require('util')
var credentials = require('./credentials.json');
var express = require('express');
var TokenProvider = require('./lib/tokenprovider');

var app = new express();
var tokenProvider = new TokenProvider(credentials);

app.get('/getToken', function(req, res) {
  var identity = req.query && req.query.identity;
  var endpointId = req.query && req.query.endpointId;

  if (!identity || !endpointId) {
    res.status(400).send('getToken requires both an Identity and an Endpoint ID');
  }

  var token = tokenProvider.getToken(identity, endpointId);
  res.send(token);
});

app.use(express.static(__dirname + '/public'));

app.listen(8080);


var IpMessagingClient = require('twilio').IpMessagingClient;

var client = new IpMessagingClient(credentials.accountSid, credentials.authToken);
var service = client.services(credentials.instanceSid);

// roles
service.roles.list().then(function(response) {
  console.log('ROLES', util.inspect(response, false, 5, true));
}).fail(function(error) {
  console.log(error);
});

var GENERAL_CHANNEL_NAME = 'General Chat Channel'

// channels
service.channels.list().then(function(response) {
  console.log('CHANNELS', util.inspect(response, false, 5, true));

  var _findGeneral = function(channel) {
    return channel.friendly_name == GENERAL_CHANNEL_NAME
  }

  var general = response.channels.filter(_findGeneral)[0]

  var generalChannelSid = general.sid

  // messages
  service.channels(generalChannelSid).messages.list().then(function(response) {
    console.log('MESSAGES in GENERAL', util.inspect(response, false, 5, true));
  }).fail(function(error) {
    console.log(error);
  });

  // members
  service.channels(generalChannelSid).members.list().then(function(response) {
    console.log('MEMBERS in GENERAL', util.inspect(response, false, 5, true));
  }).fail(function(error) {
    console.log(error);
  });

}).fail(function(error) {
  console.log(error);
});
