
var snmp = require('snmp-native'),
	Server = require('./lib/server'),
	config = require('./config.3.json') || {},
	utils = require('./lib/utils'),

	express = require('express'),
	app = express(),

	port = 8080,

	serverList = [],
	serverListQueue = [],
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
	Server.initialize( config );

	
	if(    config.servers
		&& config.servers.length > 0 )
	{
		config.servers.forEach(function(entry) {

			if(    entry
				&& (    entry.enabled == undefined
					 || entry.enabled ) )
			{
				var server = Server.deserialize(entry) ;

				loadWait++;

				server.createSession(function(err) {

					loadFinish++;

					if( !err )
					{
						// if( config.priorityLists )
						// 	Server.changePriorityList( server, 0 );

						// // if( serverList.length == 0 )
						// // 	serverList.push( server );
						// // else
							serverListQueue.push( server );
					}

					//if( loadWait == loadFinish )
					process.nextTick(timerFunc);
				});
			}
		});
	}
}


/**************************************************************************************************/

app.get('/test', function (req, res) {

	resJSON(req, res, {state: "ok"}, 200);
});

app.get('/request', function (req, res) {

	var srv = undefined,

		i,pList,

		srvOpt,
		srvName = undefined,
		srvHost = undefined,

		updatePriority = true;


	var _pick_server_fron_list = function(list)
	{
		var min = Infinity,
			_srv = undefined;

		for( var j = 0; j < list.length; j++ )
		{
			if(    list[j].canUse()
				&& list[j].metric < min )
			{
				min = list[j].metric;
				_srv = list[j] ;
			}
		}

		return _srv;
	}



	if( config.priorityLists )
	{
		for( i = 0; i < Server.getPriorityListSize(); i++ )
		{
			pList = Server.getPriorityList(i);

			if( pList.length > 0 )
			{
				srv =_pick_server_fron_list( pList );

				if( srv !== undefined )
					break;
			}
		}
	}
	else
		srv =_pick_server_fron_list( serverList );


	if(    srv == undefined
		&& serverListQueue.length > 0 )
	{
		srv = serverListQueue[0];

		serverListQueue.splice(0, 1);

		serverList.push( srv );

		if( config.priorityLists )
		{
			updatePriority = false;
			Server.changePriorityList(srv, 1);
		}
	}


	if( srv !== undefined )
	{
		srvOpt = srv.options || {} ;

		srvName = srvOpt.name;
		srvHost = srvOpt.publicHost;

		if(    config.priorityLists
			&& updatePriority )
		{
			i = 1 + srv.priority ;

			Server.changePriorityList(srv, i);
		}

		resJSON(req, res, {state: "ok", code: 0, serverName: srvName, serverHost: srvHost }, 200);
	}
	else
		resJSON(req, res, {state: "No Server available", code: 1 }, 200);
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
