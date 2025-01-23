const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion, 
  MessageRetryMap,
  makeCacheableSignalKeyStore, 
  jidNormalizedUser 
} = await import('@whiskeysockets/baileys')
import moment from 'moment-timezone'
import NodeCache from 'node-cache'
import readline from 'readline'
import qrcode from "qrcode"
import crypto from 'crypto'
import fs from "fs"
import pino from 'pino';
import * as ws from 'ws';
const { CONNECTING } = ws
import { Boom } from '@hapi/boom'
import { makeWASocket } from '../lib/simple.js';

if (global.conns instanceof Array) console.log()
else global.conns = []

let handler = async (m, { conn: _conn, args, usedPrefix, command, isOwner }) => {
  let parent = args[0] && args[0] == 'please' ? _conn : await global.conn
  if (!((args[0] && args[0] == 'please') || (await global.conn).user.jid == _conn.user.jid)) {
      return m.reply(`This command can only be used in the main bot! wa.me/${global.conn.user.jid.split`@`[0]}?text=${usedPrefix}code`)
  }

  async function serbot() {

      let authFolderB = m.sender.split('@')[0]
      if (!fs.existsSync("./Session/" + authFolderB)) {
          fs.mkdirSync("./Session/" + authFolderB, { recursive: true });
      }
      args[0] ? fs.writeFileSync("./Session/" + authFolderB + "/creds.json", JSON.stringify(JSON.parse(Buffer.from(args[0], "base64").toString("utf-8")), null, '\t')) : ""

      const { state, saveState, saveCreds } = await useMultiFileAuthState(`./Session/${authFolderB}`)
      const msgRetryCounterMap = (MessageRetryMap) => { };
      const msgRetryCounterCache = new NodeCache()
      const { version } = await fetchLatestBaileysVersion();
      let phoneNumber = m.sender.split('@')[0]

      const methodCodeQR = process.argv.includes("qr")
      const methodCode = !!phoneNumber || process.argv.includes("code")
      const MethodMobile = process.argv.includes("mobile")

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const question = (text) => new Promise((resolve) => rl.question(text, resolve))

      const connectionOptions = {
          logger: pino({ level: 'silent' }),
          printQRInTerminal: false,
          mobile: MethodMobile, 
          browser: ["Ubuntu", "Chrome", "20.0.04"],
          auth: {
              creds: state.creds,
              keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
          },
          markOnlineOnConnect: true, 
          generateHighQualityLinkPreview: true, 
          getMessage: async (key) => {
              let jid = jidNormalizedUser (key.remoteJid)
              let msg = await store.loadMessage(jid, key.id)
              return msg?.message || ""
          },
          msgRetryCounterCache,
          msgRetryCounterMap,
          defaultQueryTimeoutMs: undefined,   
          version
      }

      let conn = makeWASocket(connectionOptions)

      if (methodCode && !conn.authState.creds.registered) {
          if (!phoneNumber) {
              process.exit(0);
          }
          let cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');

          setTimeout(async () => {
              let codeBot = await conn.requestPairingCode(cleanedNumber);
              codeBot = codeBot?.match(/.{1,4}/g)?.join("-") || codeBot;
              let txt = `*\`「🤍」 Serbot - Code 「🤍」\`*\n\n*\`[ Steps : ]\`*\n\`1 ❥\` _Click on the 3 dots_\n\`2 ❥\` _Tap on linked devices_\n\`3 ❥\` _Select Link with code_\n\`4 ❥\` _Enter the Code_\n\n> *:⁖֟⊱┈֟፝❥ Note:* This Code Only Works With The One Who Requested It`
              await parent.reply(m.chat, txt, m, rcanal)
              await parent.reply(m.chat, codeBot, m, rpl)
              rl.close()
          }, 3000)
}

      conn.isInit = false
      let isInit = true

      async function connectionUpdate(update) {
          const { connection, lastDisconnect, isNewLogin, qr } = update
          if (isNewLogin) conn.isInit = true
          const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;
          if (code && code !== DisconnectReason.loggedOut && conn?.ws.socket == null) {
              let i = global.conns.indexOf(conn)
              if (i < 0) return console.log(await creloadHandler(true).catch(console.error))
              delete global.conns[i]
              global.conns.splice(i, 1)

              if (code !== DisconnectReason.connectionClosed) {
                  parent.sendMessage(m.chat, { text: "Connection lost.." }, { quoted: m })
              }
          }

          if (global.db.data == null) loadDatabase()

          if (connection == 'open') {
              conn.isInit = true
              global.conns.push(conn)
              await parent.reply(m.chat, args[0] ? 'Connected successfully' : '*\`[ Successfully Connected 🤍 ]\`*\n\n> _It will attempt to reconnect in case of session disconnection_\n> _If you want to delete the sub-bot, delete the session in linked devices_\n> _The bot number may change, save this link :_\n\nhttps://whatsapp.com/channel/0029VaJxgcB0bIdvuOwKTM2Y', m)
              await sleep(5000)
              if (args[0]) return

              await parent.reply(conn.user.jid, `The next time you connect, send the following message to log in without using another code`, m, rpl)

              await parent.sendMessage(conn.user.jid, { text: usedPrefix + command + " " + Buffer.from(fs.readFileSync("./serbot/" + authFolderB + "/creds.json"), "utf-8").toString("base64") }, { quoted: m })
          }
      }

      setInterval(async () => {
          if (!conn.user) {
              try { conn.ws.close() } catch { }
              conn.ev.removeAllListeners()
              let i = global.conns.indexOf(conn)
              if (i < 0) return
              delete global.conns[i]
              global.conns.splice(i, 1)
          }
      }, 60000)

      let handler = await import('../handler.js')
      let creloadHandler = async function (restartConn) {
          try {
              const Handler = await import(`../handler.js?update=${Date.now()}`).catch(console.error)
              if (Object.keys(Handler || {}).length) handler = Handler
          } catch (e) {
              console.error(e)
          }
          if (restartConn) {
              try { conn.ws.close() } catch { }
              conn.ev.removeAllListeners()
              conn = makeWASocket(connectionOptions)
              isInit = true
          }

          if (!isInit) {
              conn.ev.off('messages.upsert', conn.handler)
              conn.ev.off('connection.update', conn.connectionUpdate)
              conn.ev.off('creds.update', conn.credsUpdate)
          }

          conn.handler = handler.handler.bind(conn)
          conn.connectionUpdate = connectionUpdate.bind(conn)
          conn.credsUpdate = saveCreds.bind(conn, true)

          conn.ev.on('messages.upsert', conn.handler)
          conn.ev.on('connection.update', conn.connectionUpdate)
          conn.ev.on('creds.update', conn.credsUpdate)
          isInit = false
          return true
      }
      creloadHandler(false)
  }
  serbot()
}
handler.help = ['code']
handler.tags = ['serbot']
handler.command = ['pair', 'code']
handler.rowner = false

export default handler

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
