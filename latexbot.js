const discord = require('discord.js');
const fs = require('fs');
const storage = require('node-persist');
const XMLHttpRequest = require('xhr2');
const FileReader = require('filereader');
storage.initSync();
var registry = storage.getItem('registry');
if (!registry) {
	registry = {};
	storage.setItem('registry', registry);
}

String.prototype.scan = function(regex) {
    if (!regex.global) throw "regex must have 'global' flag set";
    var r = []
    this.replace(regex, function() {
        r.push(Array.prototype.slice.call(arguments, 1, -2));
    });
    return r;
};

MarkovNode = function(degree) {
	this.children = {};
	this.probability = 0;
	this.count = 0;
	this.totalCount = 0;
	this.degree = degree || 0;
};

function addChild(node, word) {
	node.children[word] = node.children[word] || new MarkovNode();
	node.children[word].count++;
	node.totalCount++;
	return node.children[word];
}

function computeProbs(node) {
	for (var c in node.children) {
		var child = node.children[c];
		child.probability = child.count/node.totalCount;
		computeProbs(child);
	}
}

function selectWord(root, words) {
	var node = root;
	for (var i = 0; i < words.length; i++) {
		node = node.children[words[i]];
		if (!node) return '\0';
	}
	r = Math.random();
	for (var c in node.children) {
		var child = node.children[c];
		r -= child.probability;
		if (r < 0) return c;
	}
}

function addSentence(root, line) {
	var degree = root.degree;
	line = ['\1'].concat(line.split(' '));
	line.push('\0');
	for (var j = 0; j < line.length - degree; j++) {
		var f = line.slice(j, j+degree+1);
		var node = root;
		for (var k = 0; k < f.length; k++) {
			node = addChild(node, f[k]);
		}
	}
	computeProbs(root);
}

function constructMarkov(lines, degree) {
	var root = new MarkovNode(degree);
	for (var i = 0; i < lines.length; i++) {
		addSentence(root, lines[i]);
	}
	return root;
}

function makeSentence(root) {
	var sentence = [];
	var words = ['\1'];
	var word;
	var degree = root.degree;
	while (word != '\0') {
		word = selectWord(root, words);
		if (word == '\0') break;
		sentence.push(word);
		words.push(word);
		if (words.length > degree) {
			words.shift();
		}
	}
	return sentence.join(' ');
}


var ZTD = {
	mysteriousThings: ['Q', 'Junpei\'s jacket', 'Blick Winkel', 'Carlos', 'Eric',
						'Kyle', 'Zero', 'Gab', 'Mila', 'Diana', 'Junpei', 'Akane'],
	participants: ['Q', 'Mila', 'Eric', 'Diana', 'Sigma', 'Phi', 'Carlos', 'Junpei', 'Akane'],
	allCharacters: ['Q', 'Mila', 'Eric', 'Diana', 'Sigma', 'Phi', 'Carlos', 'Junpei', 'Akane',
					'Gab', 'Zero', 'Brother', 'Left', 'Quark', 'Clover'],
	revealThings: ['Q', 'Mila', 'Eric', 'Diana', 'Sigma', 'Phi', 'Carlos', 'Junpei', 'Akane',
					'Gab', 'Zero', 'Brother', 'Left', 'Quark', 'Clover', 'fake',
					'an AI', 'non-existant'],
	secrets: ['They are actually Ace in disguise.', 'They have time travelled backwards.',
			  'They are really Carlos\'s little sister.', 'They know about the Radical-6 outbreak.',
			  'They are working with Zero.', 'They actually don\'t exist.'],
	times: ['Early in the game', 'In the middle of the game', 'In a bad end', 'In the true end'],
	templates: [['%times', ', it is revealed that ', '%mysteriousThings', ' is actually ', '%revealThings'],
				['%participants', ' is forced to kill ', '%participants', ', regardless of the ending.'],
				['%times', ', ', '%participants', ' tells the others their big secret: ', '%secrets']]
};

function randomZTDspoiler() {
	var random = ZTD.templates[Math.floor(Math.random()*ZTD.templates.length)];
	var str = "";
	for (var i = 0; i < random.length; i++) {
		var n = random[i];
		if (n.charAt(0) == '%') {
			var word = ZTD[n.substring(1)][Math.floor(Math.random()*ZTD[n.substring(1)].length)];
			str += word;
		} else {
			str += n;
		}
	}
	return str;
}


try {
	file = fs.readFileSync('./markov.txt').toString().split('\n');
} catch (e) {
	file = [];
}
var markov = constructMarkov(file, 2);

var bot = new discord.Client({autoReconnect: true});

bot.on('ready', function () {
	console.log('Ready!');
	bot.user.setStatus('the Markov game');
});

bot.on('message', function (msg) {
	if (msg.author != bot.user) {
		var result = msg.content.scan(/(?:^|\s)\$((?:[^$]|\\.)*?[^\\])\$(?:\s|$)/g);
		for (var i = 0; i < result.length; i++) {
			var url = "http://chart.apis.google.com/chart?cht=tx&chl=" + encodeURIComponent(result[i][0]);
			msg.channel.sendMessage(url);
		}
		var result = msg.content.scan(/^!register (.+)$/g);
		if (result.length > 0) {
			var fields = result[0][0].split(',');
			for (var i = 0; i < fields.length; i++) {
				fields[i] = fields[i].replace(/\s/g, '').toLowerCase();
				var field = fields[i];
				registry[field] = registry[field] || [];
				var index = registry[field].indexOf(msg.author.mention());
				if (index === -1)
					registry[field].push(msg.author.mention());
			}
			storage.setItem('registry', registry);
			msg.channel.sendMessage("Success! You are now registered for the following proficiencies:\n" + result[0][0]);
			return;
		}
		var result = msg.content.scan(/^!unregister (.+)$/g);
		if (result.length > 0) {
			var fields = result[0][0].split(',');
			for (var i = 0; i < fields.length; i++) {
				fields[i] = fields[i].replace(/\s/g, '').toLowerCase();
				var field = fields[i];
				if (registry[field]) {
					var index = registry[field].indexOf(msg.author.mention());
					if (index > -1) {
						registry[field].splice(index, 1);
					}
				}
			}
			storage.setItem('registry', registry);
			msg.channel.sendMessage("Success! You are now unregistered from the following proficiencies:\n" + result[0][0]);
			return;
		}
		var result = msg.content.scan(/^!listproficiencies (.+)/g);
		if (result.length > 0) {
			var mention = result[0][0];
			var str = "The user " + mention + " is proficient in:\n";
			var profs = [];
			for (var p in registry) {
				var prof = registry[p];
				if (prof.indexOf(mention) > -1) {
					profs.push(p);
				}
			}
			str += profs.join(', ');
			msg.channel.sendMessage(str);
			return;
		}
		var result = msg.content.scan(/^!requesthelp (.+)$/g);
		if (result.length > 0) {
			var field = result[0][0].replace(/\s/g, '').toLowerCase();
			var responseStr = "";
			if (registry[field]) {
				responseStr = "Automatically mentioning all people with a reported proficiency in *" + result[0][0] + "*:\n"
				for (var i = 0; i < registry[field].length; i++) {
					responseStr += registry[field][i] + " ";
				}
			} else {
				responseStr = "Sorry, but nobody has reported a proficiency in *" + result[0][0] + "*.";
			}
			msg.channel.sendMessage(responseStr);
			return;
		}
		var result = msg.content.scan(/^(!spoilZTD)$/g);
		if (result.length > 0) {
			msg.channel.sendMessage(randomZTDspoiler());
		}
		var result = msg.content.scan(/^(!help)$/g);
		if (result.length > 0) {
			msg.channel.sendMessage( 
							"List of commands:\n" +
							"if you mention me I'll respond ;)\n" +
							"-----\n" +
							"!help - you just used this, you know what it does.\n" +
							"!register <list of proficiencies separated by commas> - registers you in the help registry\n" +
							"!requesthelp <proficiency> - calls for help from all people who have registered under the requested proficiency."
							);
			return;
		}
		/*fs.appendFileSync('./markov.txt', msg.content + "\n");
		addSentence(markov, msg.content);*/
		if (msg.isMentioned(bot.user)) {
			msg.channel.sendMessage(makeSentence(markov));
		}
	}
});

bot.login('token');
bot.login('token');