import { createServer } from 'http';
//import * as h3 from 'h3';
const h3 = require('h3');
import fetch from 'node-fetch';
import * as crypto from 'crypto';
const config = require('../config.json');

const post = async (text: string, home = true) => {
	await fetch(config.instance + '/api/notes/create', {
		method: 'post',
		body: JSON.stringify({
			i: config.i,
			text,
			visibility: home ? 'home' : 'public',
			noExtractMentions: true,
			noExtractHashtags: true
		}),
		headers: {
			'Content-Type': 'application/json'
		},
	}).then(res => {
		if (!res.ok) {
			throw `${res.status} ${res.statusText}`;
		} else {
			return res.status === 204 ? {} : res.json();
		}
	});
};

const secret = config.hookSecret;

const app = h3.createApp();
const router = h3.createRouter();

router.post('/github', h3.eventHandler(async h3Event => {
	const type = h3Event.req.headers['x-github-event'] as string;
	const event = await h3.readBody(h3Event);
	const body = JSON.stringify(event);
	const hash = crypto.createHmac('sha1', secret).update(body).digest('hex');
	const sig1 = Buffer.from(h3Event.req.headers['x-hub-signature'] as string);
	const sig2 = Buffer.from(`sha1=${hash}`);

	// シグネチャ比較
	if (sig1.equals(sig2)) {
		console.log(type, event);
		handle(type, event);
		h3Event.res.statusCode = 204;
		h3Event.res.end();
	} else {
		console.log('401');
		h3Event.res.statusCode = 401;
		h3Event.res.end();
	}
}));

const server = createServer(h3.toNodeListener(app));

app.use(router);

server.requestTimeout = 60 * 1000;

server.listen(process.env.PORT || config.port);

async function handle(type: string, event: any) {
	switch (type) {
		case 'status': {
			const state = event.state;
			switch (state) {
				case 'error':
				case 'failure':
					const commit = event.commit;
					const parent = commit.parents[0];
		
					// Fetch parent status
					const res = await fetch(`${parent.url}/statuses`, {
						headers: {
							'User-Agent': 'misskey'
						}
					});

					if (!res.ok) {
						console.error(res.status);
						return;
					}

					const body = await res.text();
					const parentStatuses = JSON.parse(body);
					const parentState = parentStatuses[0].state;
					const stillFailed = parentState == 'failure' || parentState == 'error';
					if (stillFailed) {
						post(`⚠️BUILD STILL FAILED⚠️: ?[${commit.commit.message}](${commit.html_url})`);
					} else {
						post(`🚨BUILD FAILED🚨: →→→?[${commit.commit.message}](${commit.html_url})←←←`);
					}

					break;
			}
			break;
		}

		case 'push': {
			const ref = event.ref;
			switch (ref) {
				case `refs/heads/${config.branch || 'master'}`:
					const pusher = event.pusher;
					const compare = event.compare;
					const commits: any[] = event.commits;
					post([
						`🆕 Pushed by ${pusher.name} with ?[${commits.length} commit${commits.length > 1 ? 's' : ''}](${compare}):`,
						commits.reverse().map(commit => `・[?[${commit.id.substr(0, 7)}](${commit.url})] ${commit.message.split('\n')[0]}`).join('\n'),
					].join('\n'));
					break;
			}
			break;
		}

		case 'issues': {
			const issue = event.issue;
			const action = event.action;
			let title: string;
			switch (action) {
				case 'opened': title = '💥 Issue opened'; break;
				case 'closed': title = '💮 Issue closed'; break;
				case 'reopened': title = '🔥 Issue reopened'; break;
				default: return;
			}
			post(`${title}: <${issue.number}>「${issue.title}」\n${issue.html_url}`);
			break;
		}

		case 'issue_comment': {
			const issue = event.issue;
			const comment = event.comment;
			const action = event.action;
			let text: string;
			switch (action) {
				case 'created': text = `💬 Commented to「${issue.title}」:${comment.user.login}「${comment.body}」\n${comment.html_url}`; break;
				default: return;
			}
			post(text);
			break;
		}
		
		case 'release': {
			const action = event.action;
			const release = event.release;
			let text: string;
			switch (action) {
				case 'published': text = `🎁 NEW RELEASE: [${release.tag_name}](${release.html_url}) is out now. Enjoy!`; break;
				default: return;
			}
			post(text, false);
			break;
		}
		
		case 'watch': {
			const sender = event.sender;
			post(`⭐️ Starred by ${sender.login} ⭐️`, false);
			break;
		}
		
		case 'fork': {
			const repo = event.forkee;
			post(`🍴 Forked:\n${repo.html_url} 🍴`);
			break;
		}
		
		case 'pull_request': {
			const pr = event.pull_request;
			const action = event.action;
			let text: string;
			switch (action) {
				case 'opened': text = `📦 New Pull Request:「${pr.title}」\n${pr.html_url}`; break;
				case 'reopened': text = `🗿 Pull Request Reopened:「${pr.title}」\n${pr.html_url}`; break;
				case 'closed':
					text = pr.merged
						? `💯 Pull Request Merged!:「${pr.title}」\n${pr.html_url}`
						: `🚫 Pull Request Closed:「${pr.title}」\n${pr.html_url}`;
					break;
				default: return;
			}
			post(text);
			break;
		}

		default: {
			console.log(`skip: ${type}`);
			if (config.debug) {
				const body = JSON.stringify(event, null ,2);
				post(`type: ${type}\n`);
			}
		}
	}
}
