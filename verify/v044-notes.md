# SMASHVR ?v=44 notes — invite-link auto-join + handshake deep-dive

## User report (2026-10-23, live test with a second person)
- Host creates lobby fine. Guest opens invite link: "Link opens the game but
  never joins." (Earlier: "codes don't connect", "online basically only
  creates a lobby and the actual invite link doesn't even work".)

## What the earlier (parent-run) QR repro actually proved — and didn't
- Guest B auto-joined (lobby up, code matched, host saw 4 WS frames from B),
  BUT: B's lobby player list stayed EMPTY and A's listed only HostA → the
  lobby state (rides the Trystero DATA CHANNEL) never crossed → no data
  channel ever connected in the sandbox. Expected in-VM (UDP blocked)…
  …but the "sentOffers=0 / sentAnswers=0 / pcs=40" smoking gun is largely a
  MEASUREMENT ARTIFACT (see below). The real open questions: (1) does
  auto-join fire on a pure production URL with no ?debug=1? (2) do
  offer/answer negotiations actually run when two clients meet?

## Trystero 0.25.4 source findings (fetched esm.sh builds, read directly)
- Offer pool: core warms up Ct=20 pooled RTCPeerConnections PER STRATEGY
  ROOM at joinRoom. SMASHVR joins 2 strategies (torrent + nostr) → 40 PCs
  on the guest is BY DESIGN, not a retry storm. Pooled offers refresh when
  older than ~57s (De=57333).
- Who offers: the pool belongs to the room; when a peer is discovered via an
  announce, the discovering side claims a pooled offer and sends it; the
  other side answers. Torrent: joining side ALSO posts offers in its
  tracker announce (numwant=3 top-up per tracker scope).
- Nostr signaling payloads (offer/answer/candidate) are AES-GCM ENCRYPTED
  by core (key from appId:roomId even with no password). Announces carry
  plaintext {peerId}. → the old harness's hasOffer parse of EVENT content
  could NEVER see a nostr offer. Torrent tracker messages are plaintext
  JSON objects ({action:'announce', offers:[...]}) — the old parser only
  understood nostr EVENT arrays, so it missed those too. sentOffers=0 is
  therefore UNPROVEN either way; must measure at the RTCPeerConnection
  layer (wrap createOffer/setLocal/setRemote/ice states).
- isPassive comes from config.passive — SMASHVR doesn't set it → rooms are
  ACTIVE. Passive gating is NOT in play.
- Nostr: REQ uses since=now → no historical-event replay; event kinds are
  ephemeral 20000–29999. Room topic = tag from appId+roomId hashes;
  appId 'smashvr-v011' is unique enough — no cross-app collision.
- Torrent trackers (defaults): open.ftorrent.com, tracker.webtorrent.dev,
  tracker.openwebtorrent.com, tracker.btorrent.xyz,
  tracker.files.fm:7073/announce. trickleIce defaults FALSE for torrent
  (candidates ride inside SDPs); nostr trickles.
- Nostr steady announce interval is 60s; torrent announce starts ~10s.

## LIMBO diff (the stack that works for him on real phones)
- SAME esm.sh 0.25.4 strategies, SAME pinned nostr relays, SAME
  buildIceServers (STUN + OpenRelay TURN UDP/TCP + turns:443). ICE config
  is NOT the delta.
- What LIMBO has that SMASHVR lacks: (a) ICE-failure retry — leave+rejoin
  with 10s→60s backoff while peerless; (b) 20s handshake watchdog —
  "announced but zero joined peers" forces the retry path; (c) a raw-nostr
  relay data fallback (build 37, RelayLink). SMASHVR: zero recovery — one
  stalled handshake = dead lobby forever.

## main.js join path (current, ?v=43)
- joinUrlFor(code) = origin + pathname + '#net=' + code. On Pages:
  https://joshuagwatts.github.io/smashvr/#net=CODE — form is correct.
- Boot (end of module eval): if location.hash matches #net=XXXXXX →
  autoJoinFromLink() → openOnline() (fills #net-code from hash) → joinLobby().
- DEBUG (?debug=1) only gates window.__sv observability — NOT the join
  path. But the earlier repro's guest ran WITH debug; production form
  (no query at all) has never been tested. Also untested: hashchange
  arrivals (link tapped while game already open / fragment delivered
  late), and fragment-stripped shares (very common from messaging apps /
  in-app browsers → game loads plain, zero join attempt — fits the
  symptom exactly).
- No sticky intent: the hash is read exactly once, at module-eval end.
  Anything that goes wrong in that single attempt (slow esm.sh import,
  transient failure) ends at a status line the guest may never see.
- No service worker in SMASHVR. lobbyCode alphabet is [A-Z0-9]-safe.

## Harness artifacts discovered (do not mistake for game bugs)
- REPRO BUG (mine, v2/v3 harness): the init script lived in a template
  literal; its regex /^wss?:\/\// evaluated to /^wss?:/// (unterminated
  regex) → SyntaxError in-page, capture object never installed. All DOM
  observations from those runs remain valid (auto-join DID fire on the
  pure production URL — B sat at "Joining lobby…" then entered an empty
  lobby); PC-layer data was simply never collected. Fixed by dropping
  the regex. The parent's earlier harness used a plain string replace —
  which is why theirs worked.
- sentOffers=0 (parent's run): measurement artifact #1 (see above).

## REPRO RESULTS (invite-repro3.mjs, fixed harness, production URL, no debug)
- Auto-join FIRES on the pure production URL (hash form). B: "Joining
  lobby…" immediately. Debug gating EXONERATED.
- B's transport took ~25s to exist (pcs 0, zero WebSockets until ~t+27s):
  createNetTransport does two SEQUENTIAL esm.sh dynamic imports (torrent
  graph, then nostr graph) before any socket opens. On a real phone /
  slow network the guest stares at "Joining lobby…" with the host seeing
  nothing — and any hiccup in that window is unrecoverable (no retry).
- NEGOTIATION COMPLETES over nostr: B setRemoteDescription(offer)=1 and
  its PC reached signaling 'stable'; A setRemoteDescription(answer)=1,
  addIceCandidate=2 (B→A trickle). A→B trickle 0 — benign: A's candidates
  ride inside the pooled offer's SDP (pool + trickleIce=false semantics
  on the offer side). The parent's "zero offers" was an artifact.
- ICE never leaves 'new' in the VM: candidate types = host only (UDP
  blocked → no srflx, no TURN/UDP; TURN/TLS gets nothing either since
  WebRTC bypasses the HTTP proxy and direct egress is closed). This is
  the sanctioned VM ceiling: signaling + SDP negotiation are the last
  verifiable layer here.
- Tracker count is 3 of 5 by design (getRelays redundancy=3, same as
  LIMBO); nostr relays = the 3 pinned. 6 sockets total on both sides.
- LOBBY NEVER SYNCS in the sandbox because the data channel needs ICE.
  On real networks the channel is the only remaining hop — and SMASHVR
  gives it exactly ONE attempt with zero recovery (vs LIMBO's retry
  ladder + watchdog). Combined with fragment-stripped shares (no join
  attempt at all) and the slow cold start, "link never joins" on real
  phones is overdetermined. Fixes below target exactly those three.

## Fixes shipped in ?v=44 (this run)
1. joinUrlFor emits ?join=CODE#net=CODE (both forms). parseInviteCode:
   query first, then hash. openOnline prefills from either.
2. Sticky pendingJoin: parsed at module init + hashchange listener for
   late fragment arrivals; autoJoinFromLink consumes it and strips
   both forms from the URL. Back button on the online screen cancels a
   transport-less session (incl. retries), never an active lobby.
3. Watchdog (netWatchTick, 5s): guest rebuilds transport on same code
   if never listed by host after 25s (or join threw, after ~6s), max 3;
   host rebuilds a peerless room after 60s, max 2; any peer join resets
   the counter; startNetMatch/leaveLobby stop it. Rebuilds toast.
   connectHost/connectGuest factored out of create/joinLobby.
4. createNetTransport: TURN creds + BOTH strategy module graphs now
   load in parallel (was sequential awaits).
5. warmNetModules(): openOnline prefetches the strategy modules +
   TURN creds so manual Create/Join reuses in-flight loads.

## Post-fix repro (invite-repro4.mjs, local mirror == shipped tree)
- QR decodes to .../smashvr/?join=EBXCZS#net=EBXCZS — both forms ✓.
- Guests: full-URL attempt@4s transport@28s; query-only attempt@4s
  transport@12s; hash-only attempt@4s transport@4s + NEGOTIATED@28s
  (recvOffer=1, signaling stable). Host side across guests:
  setRemoteOffer=2, setRemoteAnswer=1, addIceCand=2, trkAnswers=2 —
  offer/answer completes repeatedly, both directions, nostr + torrent.
  (Time-to-negotiate in-sandbox is dominated by proxy WS latency +
  nostr's 60s announce cadence; LIMBO on the same stack connects for
  him on real phones.)
- Watchdog: guest toasts "retrying (1/3)…(3/3)", transport generations
  40→80→120 PCs; host toasted (2/2) on the 60s rule. One observed edge:
  a negotiation landing right at ~28s raced the 25s rebuild once —
  self-heals on the fresh attempt; phones normally list in <10s.
- STILL unverifiable here: ICE connect + data channel (host candidates
  only — UDP blocked, direct TCP egress closed, WebRTC ignores the
  HTTP proxy). On his phones he should see: tap link → game opens →
  "Joining lobby…" (a few seconds) → lobby WITH BOTH NAMES listed.
  If a join wedges, the toast "Connection stalled — retrying" appears
  and it self-recovers; 3 failed retries = the other end isn't there.

## Shipped
- Commit c1754afab0f1880cafb8f54067161ba680b8326c (15 files: index.html,
  12 js pin-carriers, test/spectre.mjs, these notes). Pages serving
  ?v=44; ALL live files byte-identical to the shipped tree (cmp over
  index.html + css + js/*), and served main.js contains the ?join=
  emitter. Post-bump smoke on this exact tree: boots at ?v=44, host
  lobby + guest auto-join via ?join= URL, zero page errors.
- Tests post-fix: moveset/combo/spectre PASS, determinism 6/6,
  test_logic 14/14, touch_input 17/17, hitbox_sync 712-sample PASS,
  facing 22/22; netproto 13+1 = baseline (pre-existing input-delay
  fail, protocol untouched); autorig 70+4 = baseline; signaling /
  lobby_ui crash identically to baseline (environment).

## Fix plan
1. ?join=CODE query param: joinUrlFor emits BOTH (?join=CODE#net=CODE);
   boot reads query first, then hash. Query survives share pipelines
   that strip fragments.
2. Sticky pendingJoin: parse at boot + on hashchange; store intent;
   the online/lobby flow consumes it when ready; failed attempts retry
   with backoff while intent pending (visible status, cancellable by
   navigating away / leaving).
3. Lobby handshake watchdog (LIMBO-style, minimal): in-lobby with zero
   transport peers for ~25s → tear down + recreate transport on the
   same code (host keeps slot/code; guest re-hellos), up to a few
   attempts. Gives real phones the recovery loop LIMBO has.
4. Verify with PC-layer instrumentation: offers/answers/candidates and
   signalingState reaching 'stable' in the sandbox; ICE connect itself
   remains unverifiable here (UDP blocked) — state that plainly.
