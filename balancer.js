
var snmp = require('snmp-native'),
	Server = require('./lib/server'),
	config = require('./config.json'),

	express = require('express'),
	app = express(),

	port = 8080,

	serverList = [],
	loadWait = 0;
	loadFinish = 0;

const CHECK_INTERVAL = 1000 ;



app.configure(function() {

	// app.use('/static', express.static(__dirname + '/static'));

	app.use(function (req, res, next) {

		res.setHeader('Server', 'VOD-Balancer-1-0');

		next();
	});


	app.enable('trust proxy');
	app.disable('x-powered-by');

	app.use('/', app.router);
});




/**************************************************************************************************/


function parsePort()
{
	var args = process.argv.splice(2),
		p = null;

	if (args.length > 0)
	{
		p = parseInt(args[0]);
		if( p )
			port = p ;

		p = null;
	}
}

function resJSON(req, res, out, statusCode) {

	var size;

	out = JSON.stringify( out );
	size = Buffer.byteLength( out, 'UTF-8' );

	res.writeHead( statusCode,
				   { 'Content-Type': 'application/json; charset=utf-8',
					 'Content-Length': size} );

	res.write( out );
	res.end();
}

var timerFunc = function()
{
	for(var i = 0; i < serverList.length; i++)
		serverList[i].checkUpdate();
	
	setTimeout(timerFunc, CHECK_INTERVAL);
}


function loadServers()
{
	if(    config
		&& config.servers
		&& config.servers.length > 0 )
	{
		Server.initialize( config );
		
		config.servers.forEach(function(entry) {

			var server = Server.deserialize(entry) ;

			loadWait++;

			server.createSession(function(err) {

				loadFinish++;

				if( !err )
				{
					Server.changePriorityList( server, 0 );

					serverList.push( server );
				}

				if( loadWait == loadFinish )
					process.nextTick(timerFunc);
			});
		});
	}
}


/**************************************************************************************************/

app.get('/test', function (req, res) {

	resJSON(req, res, {state: "ok"}, 200);
});

app.get('/request', function (req, res) {

	var min = Infinity,
		srv = undefined,

		i,j,pList,

		srvOpt,
		srvName = undefined,
		srvHost = undefined;

	for( i = 0; i < Server.getPriorityListSize(); i++ )
	{
		pList = Server.getPriorityList(i);

		for( j = 0; j < pList.length; j++ )
		{
			if( pList[j].metric < min )
			{
				min = pList[j].metric;
				srv = pList[j] ;

				break;
			}
		}

		if( srv !== undefined )
			break;
	}

	if( srv !== undefined )
	{
		srvOpt = srv.options || {} ;

		srvName = srvOpt.name;
		srvHost = srvOpt.publicHost;

		i = 1 + srv.priority ;

		Server.changePriorityList(srv, i);
	}

	resJSON(req, res, {state: "ok", serverName: srvName, serverHost: srvHost }, 200);
});




/***************************************************************************************************/

// Qualquer outra rota não encontrada

app.all('*', function (req, res) {

	console.error('Wrong request received: ' + req.path + " [" + req.method + "]");

	resJSON( req, res, { error: 'Page not found'}, 404 );
});



/*****************************************************************************
 *	 Coloca a aplicação em modo de escuta na porta especificada
 *****************************************************************************/

loadServers();
parsePort();

console.log("Listening on port: " + port );
app.listen(port);


// // Create a Session with explicit default host, port, and community.
// var session = new snmp.Session({ host: '192.168.1.10', community: 'public' })

// console.log("started session");
// console.log(session);


// //.1.3.6.1.2.1.1
// //var oids = [  ];
// session.getSubtree({ oid: [1, 3, 6, 1, 2, 1] }, function (error, varbinds) {

//  console.log(error);
//  console.log(varbinds);

//     varbinds.forEach(function (vb) {
//         console.log(vb.oid + ' = ' + vb.value + ' (' + vb.type + ')');
//     });
// });
