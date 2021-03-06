var fingerprint = new Fingerprint2();
var request = window.superagent;

var accessManager;
var activeChannel;
var client;
var typingMembers = new Set();

$(document).ready(function() {
  $('#login-name').focus();

  $('#login-button').on('click', function() {
    var identity = $('#login-name').val();
    if (!identity) { return; }

    logIn(identity, identity);
  });

  $('#login-name').on('keydown', function(e) {
    if (e.keyCode === 13) { $('#login-button').click(); }
  });

  $('#message-body-input').on('keydown', function(e) {
    if (e.keyCode === 13) { $('#send-message').click(); }
    else if (activeChannel) { activeChannel.typing(); }
  });

  $('#edit-channel').on('click', function() {
    $('#update-channel-display-name').val(activeChannel.friendlyName || '');
    $('#update-channel-unique-name').val(activeChannel.uniqueName || '');
    $('#update-channel-desc').val(activeChannel.attributes.description || '');
    $('#update-channel-private').prop('checked', activeChannel.isPrivate);
    $('#update-channel').show();
    $('#overlay').show();
  });

  var isUpdatingConsumption = false;
  $('#channel-messages').on('scroll', function(e) {
    var $messages = $('#channel-messages');
    if ($('#channel-messages ul').height() - 50 < $messages.scrollTop() + $messages.height()) {
      var newestMessageIndex = activeChannel.messages.length ?
        activeChannel.messages[activeChannel.messages.length-1].index : 0;
      if (!isUpdatingConsumption && activeChannel.lastConsumedMessageIndex !== newestMessageIndex) {
        isUpdatingConsumption = true;
        activeChannel.updateLastConsumedMessageIndex(newestMessageIndex).then(function() {
          isUpdatingConsumption = false;
        });
      }
    }
  });

  $('#update-channel .remove-button').on('click', function() {
    $('#update-channel').hide();
    $('#overlay').hide();
  });

  $('#delete-channel').on('click', function() {
    activeChannel && activeChannel.delete();
  });

  $('#join-channel').on('click', function() {
    activeChannel.join().then(setActiveChannel);
  });

  $('#invite-user').on('click', function() {
    $('#invite-member').show();
    $('#overlay').show();
  });

  $('#add-user').on('click', function() {
    $('#add-member').show();
    $('#overlay').show();
  });

  $('#invite-button').on('click', function() {
    var identity = $('#invite-identity').val();
    identity && activeChannel.invite(identity).then(function() {
      $('#invite-member').hide();
      $('#overlay').hide();
      $('#invite-identity').val('');
    });
  });

  $('#add-button').on('click', function() {
    var identity = $('#add-identity').val();
    identity && activeChannel.add(identity).then(function() {
      $('#add-member').hide();
      $('#overlay').hide();
      $('#add-identity').val('');
    });
  });

  $('#invite-member .remove-button').on('click', function() {
    $('#invite-member').hide();
    $('#overlay').hide();
  });

  $('#add-member .remove-button').on('click', function() {
    $('#add-member').hide();
    $('#overlay').hide();
  });

  $('#create-channel .remove-button').on('click', function() {
    $('#create-channel').hide();
    $('#overlay').hide();
  });

  $('#create-channel-button').on('click', function() {
    $('#create-channel').show();
    $('#overlay').show();
  });

  $('#create-new-channel').on('click', function() {
    var attributes = {
      description: $('#create-channel-desc').val()
    };

    var isPrivate = $('#create-channel-private').is(':checked');
    var friendlyName = $('#create-channel-display-name').val();
    var uniqueName = $('#create-channel-unique-name').val();

    client.createChannel({
      attributes: attributes,
      friendlyName: friendlyName,
      isPrivate: isPrivate,
      uniqueName: uniqueName
    }).then(function joinChannel(channel) {
      $('#create-channel').hide();
      $('#overlay').hide();
      return channel.join();
    }).then(setActiveChannel);
  });

  $('#update-channel-submit').on('click', function() {
    var desc = $('#update-channel-desc').val();
    var friendlyName = $('#update-channel-display-name').val();
    var uniqueName = $('#update-channel-unique-name').val();

    var promises = [];
    if (desc !== activeChannel.attributes.description) {
      promises.push(activeChannel.updateAttributes({ description: desc }));
    }

    if (friendlyName !== activeChannel.friendlyName) {
      promises.push(activeChannel.updateFriendlyName(friendlyName));
    }

    if (uniqueName !== activeChannel.uniqueName) {
      promises.push(activeChannel.updateUniqueName(uniqueName));
    }

    Promise.all(promises).then(function() {
      $('#update-channel').hide();
      $('#overlay').hide();
    });
  });
});

function googleLogIn(googleUser) {
  var profile = googleUser.getBasicProfile();
  var identity = profile.getEmail().toLowerCase();
  var fullName = profile.getName();
  logIn(identity, fullName);
}

function logIn(identity, displayName) {
  fingerprint.get(function(endpointId) {
    request('/getToken?identity=' + identity + '&endpointId=' + endpointId, function(err, res) {
      if (err) { throw new Error(res.text); }

      var token = res.text;

      $('#login').hide();
      $('#overlay').hide();

      var accessManager = new Twilio.AccessManager(token);
      client = new Twilio.IPMessaging.Client(accessManager);

      $('#profile label').text(displayName);
      $('#profile img').attr('src', 'http://gravatar.com/avatar/' + MD5(identity) + '?s=40&d=mm&r=g');

      client.getChannels().then(updateChannels);

      client.on('channelJoined', function(channel) {
        channel.on('messageAdded', updateUnreadMessages);
        updateChannels();
      });

      client.on('channelInvited', updateChannels);
      client.on('channelAdded', updateChannels);
      client.on('channelUpdated', updateChannels);
      client.on('channelLeft', leaveChannel);
      client.on('channelRemoved', leaveChannel);
    });
  });
}

function updateUnreadMessages(message) {
  var channel = message.channel;
  if (channel !== activeChannel) {
    $('#sidebar li[data-sid="' + channel.sid + '"] span').addClass('new-messages');
  }
}

function leaveChannel(channel) {
  if (channel == activeChannel && channel.status !== 'joined') {
    clearActiveChannel();
  }

  channel.removeListener('messageAdded', updateUnreadMessages);

  updateChannels();
}

function addKnownChannel(channel) {
  var $el = $('<li/>')
    .attr('data-sid', channel.sid)
    .on('click', function() {
      setActiveChannel(channel);
    });

  var $title = $('<span/>')
    .text(channel.friendlyName)
    .appendTo($el);

  $('#known-channels ul').append($el);
}

function addInvitedChannel(channel) {
  var $el = $('<li/>')
    .attr('data-sid', channel.sid)
    .on('click', function() {
      setActiveChannel(channel);
    });

  var $title = $('<span class="invited"/>')
    .text(channel.friendlyName)
    .appendTo($el);

  var $decline = $('<div class="remove-button glyphicon glyphicon-remove"/>')
    .on('click', function(e) {
      e.stopPropagation();
      channel.decline();
    }).appendTo($el);

  $('#invited-channels ul').append($el);
}

function addJoinedChannel(channel) {
  var $el = $('<li/>')
    .attr('data-sid', channel.sid)
    .on('click', function() {
      setActiveChannel(channel);
    });

  var $title = $('<span class="joined"/>')
    .text(channel.friendlyName)
    .appendTo($el);

  if (channel.messages.length &&
    channel.lastConsumedMessageIndex !== channel.messages[channel.messages.length-1].index) {
    $title.addClass('new-messages');
  }

  var $leave = $('<div class="remove-button glyphicon glyphicon-remove"/>')
    .on('click', function(e) {
      e.stopPropagation();
      channel.leave();
    }).appendTo($el);

  $('#my-channels ul').append($el);
}

function removeLeftChannel(channel) {
  $('#my-channels li[data-sid=' + channel.sid + ']').remove();

  if (channel === activeChannel) {
    clearActiveChannel();
  }
}

function updateMessages() {
  $('#channel-messages ul').empty();
  activeChannel.getMessages(99999).then(function(messages) {
    messages.forEach(addMessage);
  });
}

function removeMessage(message) {
  $('#channel-messages li[data-index=' + message.index + ']').remove();
}

function updateMessage(message) {
  var $el = $('#channel-messages li[data-index=' + message.index + ']');
  $el.empty();
  createMessage(message, $el);
}

function createMessage(message, $el) {
  var $remove = $('<div class="remove-button glyphicon glyphicon-remove"/>')
    .on('click', function(e) {
      e.preventDefault();
      message.remove();
    }).appendTo($el);

  var $edit = $('<div class="remove-button glyphicon glyphicon-edit"/>')
    .on('click', function(e) {
      e.preventDefault();
      $('.body', $el).hide();
      $('.edit-body', $el).show();
      $('button', $el).show();
      $el.addClass('editing');
    }).appendTo($el);

  var $img = $('<img/>')
    .attr('src', 'http://gravatar.com/avatar/' + MD5(message.author) + '?s=30&d=mm&r=g')
    .appendTo($el);

  var $author = $('<p class="author"/>')
    .text(message.author)
    .appendTo($el);

  var time = message.timestamp;
  var minutes = time.getMinutes();
  var ampm = Math.floor(time.getHours()/12) ? 'PM' : 'AM';

  if (minutes < 10) { minutes = '0' + minutes; }

  var $timestamp = $('<span class="timestamp"/>')
    .text('(' + (time.getHours()%12) + ':' + minutes + ' ' + ampm + ')')
    .appendTo($author);

  if (message.lastUpdatedBy) {
    time = message.dateUpdated;
    minutes = time.getMinutes();
    ampm = Math.floor(time.getHours()/12) ? 'PM' : 'AM';

    if (minutes < 10) { minutes = '0' + minutes; }

    $('<span class="timestamp"/>')
      .text('(Edited by ' + message.lastUpdatedBy + ' at ' +
        (time.getHours()%12) + ':' + minutes + ' ' + ampm + ')')
      .appendTo($author)
  }

  var $body = $('<p class="body"/>')
    .text(message.body)
    .appendTo($el);

  var $editBody = $('<textarea class="edit-body"/>')
    .text(message.body)
    .appendTo($el);

  var $cancel = $('<button class="cancel-edit"/>')
    .text('Cancel')
    .on('click', function(e) {
      e.preventDefault();
      $('.edit-body', $el).hide();
      $('button', $el).hide();
      $('.body', $el).show();
      $el.removeClass('editing');
    }).appendTo($el);

  var $edit = $('<button class="red-button"/>')
    .text('Make Change')
    .on('click', function(e) {
      message.updateBody($editBody.val());
    }).appendTo($el);

  var $lastRead = $('<p class="last-read"/>')
    .text('New messages')
    .appendTo($el);

  var $membersRead = $('<p class="members-read"/>')
    .appendTo($el);
}

function addMessage(message) {
  var $messages = $('#channel-messages');
  var initHeight = $('#channel-messages ul').height();
  var $el = $('<li/>').attr('data-index', message.index);
  createMessage(message, $el);

  $('#channel-messages ul').append($el);

  if (initHeight - 50 < $messages.scrollTop() + $messages.height()) {
    $messages.scrollTop($('#channel-messages ul').height());
  }

  if ($('#channel-messages ul').height() <= $messages.height() &&
      message.index > message.channel.lastConsumedMessageIndex) {
    message.channel.updateLastConsumedMessageIndex(message.index);
  }

  var newestMessageIndex = activeChannel.messages.length ?
    activeChannel.messages[activeChannel.messages.length-1].index : 0;
  if (message.index > newestMessageIndex) {
    newestMessageIndex = message.index;
  }
}

function addMember(member) {
  var $el = $('<li/>')
    .attr('data-identity', member.identity);

  var $img = $('<img/>')
    .attr('src', 'http://gravatar.com/avatar/' + MD5(member.identity.toLowerCase()) + '?s=20&d=mm&r=g')
    .appendTo($el);

  var $span = $('<span/>')
    .text(member.identity)
    .appendTo($el);

  var $remove = $('<div class="remove-button glyphicon glyphicon-remove"/>')
    .on('click', member.remove.bind(member))
    .appendTo($el);

  updateMember(member);

  $('#channel-members ul').append($el);
}

function updateMembers() {
  $('#channel-members ul').empty();
  var members = [];

  activeChannel.members.forEach(function(member) {
    members.push(member);
  });

  members.sort(function(a, b) {
    return a.identity > b.identity;
  }).forEach(addMember);
}

function updateChannels() {
  $('#known-channels ul').empty();
  $('#invited-channels ul').empty();
  $('#my-channels ul').empty();

  var channels = [];

  client.channels.forEach(function(channel) {
    channels.push(channel);
  });

  channels = channels.sort(function(a, b) {
    return a.friendlyName > b.friendlyName;
  });

  channels.forEach(function(channel) {
    switch (channel.status) {
      case 'joined':
        addJoinedChannel(channel);
        break;
      case 'invited':
        addInvitedChannel(channel);
        break;
      default:
        addKnownChannel(channel);
        break;
    }
  });
}

function updateMember(member) {
  if (member.identity === decodeURIComponent(client.identity)) { return; }

  var $lastRead = $('#channel-messages p.members-read img[data-identity="' + member.identity + '"]');

  if (!$lastRead.length) {
    $lastRead = $('<img/>')
      .attr('src', 'http://gravatar.com/avatar/' + MD5(member.identity) + '?s=20&d=mm&r=g')
      .attr('title', member.identity)
      .attr('data-identity', member.identity);
  }

  var lastIndex = member.lastConsumedMessageIndex;
  if (lastIndex) {
    $('#channel-messages li[data-index=' + lastIndex + '] p.members-read').append($lastRead);
  }
}

function setActiveChannel(channel) {
  if (activeChannel) {
    activeChannel.removeListener('messageAdded', addMessage);
    activeChannel.removeListener('messageRemoved', removeMessage);
    activeChannel.removeListener('messageUpdated', updateMessage);
    activeChannel.removeListener('updated', updateActiveChannel);
    activeChannel.removeListener('memberUpdated', updateMember);
  }
  
  activeChannel = channel;

  $('#channel-title').text(channel.friendlyName);
  $('#channel-messages ul').empty();
  $('#channel-members ul').empty();
  activeChannel.getAttributes().then(function(attributes) {
    $('#channel-desc').text(attributes.description);
  });

  $('#send-message').off('click');
  $('#send-message').on('click', function() {
    var body = $('#message-body-input').val();
    channel.sendMessage(body).then(function() {
      $('#message-body-input').val('').focus();
      $('#channel-messages').scrollTop($('#channel-messages ul').height());
      $('#channel-messages li.last-read').removeClass('last-read');
    });
  });

  activeChannel.on('updated', updateActiveChannel);

  $('#no-channel').hide();
  $('#channel').show();

  if (channel.status !== 'joined') {
    $('#channel').addClass('view-only');
    return;
  } else {
    $('#channel').removeClass('view-only');
  }

  channel.getMessages(99999).then(function(messages) {
    messages.forEach(addMessage);

    channel.on('messageAdded', addMessage);
    channel.on('messageUpdated', updateMessage);
    channel.on('messageRemoved', removeMessage);

    var newestMessageIndex = activeChannel.messages.length ?
      activeChannel.messages[activeChannel.messages.length-1].index : 0;
    var lastIndex = channel.lastConsumedMessageIndex;
    if (lastIndex && lastIndex !== newestMessageIndex) {
      var $li = $('li[data-index='+ lastIndex + ']');
      var top = $li.position() && $li.position().top;
      $li.addClass('last-read');
      $('#channel-messages').scrollTop(top + $('#channel-messages').scrollTop());
    }

    if ($('#channel-messages ul').height() <= $('#channel-messages').height()) {
      channel.updateLastConsumedMessageIndex(newestMessageIndex).then(updateChannels);
    }

    return channel.getMembers();
  }).then(function(members) {
    updateMembers();

    channel.on('memberJoined', updateMembers);
    channel.on('memberLeft', updateMembers);
    channel.on('memberUpdated', updateMember);
  });

  channel.on('typingStarted', function(member) {
    typingMembers.add(member.identity);
    updateTypingIndicator();
  });

  channel.on('typingEnded', function(member) {
    typingMembers.delete(member.identity);
    updateTypingIndicator();
  });

  $('#message-body-input').focus();
}

function clearActiveChannel() {
  $('#channel').hide();
  $('#no-channel').show();
}

function updateActiveChannel() {
  $('#channel-title').text(activeChannel.friendlyName);
  $('#channel-desc').text(activeChannel.attributes.description);
}

function updateTypingIndicator() {
  var message = 'Typing: ';
  var names = Array.from(typingMembers).slice(0,3);

  if (typingMembers.size) {
    message += names.join(', ');
  }

  if (typingMembers.size > 3) {
    message += ', and ' + (typingMembers.size-3) + 'more';
  }

  if (typingMembers.size) {
    message += '...';
  } else {
    message = '';
  }

  $('#typing-indicator span').text(message);
}

