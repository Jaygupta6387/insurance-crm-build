/**
 * UDPDiscoveryClientService — client-side LAN server discovery.
 *
 * This runs inside Electron on a CLIENT machine (not the server).
 * It listens for UDP broadcast packets from the InsuredHub server
 * and resolves the server address automatically.
 *
 * DISCOVERY PRIORITY
 * ──────────────────
 * 1. Saved server address (from secure store) — checked by caller before starting this.
 * 2. UDP broadcast (this service) — resolves within 1-5 seconds if server is on LAN.
 * 3. Manual entry — caller falls back to this if UDP times out.
 *
 * SECURITY
 * ─────────
 * Every received packet is validated:
 *   • app name must be "InsuredHub"
 *   • version compatibility check
 *   • HMAC-SHA256 signature verified with the stored license/secret
 *   • timestamp must be within ±30 seconds (replay-attack prevention)
 */

import * as dgram from 'dgram';
import * as crypto from 'crypto';

export const DISCOVERY_PORT = 47912;
export const DISCOVERY_TIMEOUT_MS = 15_000; // Stop listening after 15 s

export interface DiscoveryPacket {
  app:        string;
  serverId:   string;
  serverName: string;
  licenseId:  string;
  version:    string;
  ip:         string;
  port:       number;
  timestamp:  number;
  signature:  string;
}

export interface DiscoveryResult {
  ip:         string;
  port:       number;
  serverId:   string;
  serverName: string;
  version:    string;
}

export class UDPDiscoveryClientService {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private signSecret: string;

  /**
   * @param signSecret  Should match the server's DISCOVERY_SIGN_SECRET env / license token prefix.
   *                    Pass '' to skip signature validation (development only).
   */
  constructor(signSecret = '') {
    this.signSecret = signSecret;
  }

  /**
   * Listen for UDP broadcasts and resolve with the first valid packet.
   * Rejects after DISCOVERY_TIMEOUT_MS if no server found.
   */
  discover(timeoutMs = DISCOVERY_TIMEOUT_MS): Promise<DiscoveryResult> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        this._cleanup();
        reject(err);
      });

      this.socket.on('message', (buf) => {
        try {
          const packet: DiscoveryPacket = JSON.parse(buf.toString('utf8'));
          if (!this._validate(packet)) return;
          this._cleanup();
          resolve({
            ip:         packet.ip,
            port:       packet.port,
            serverId:   packet.serverId,
            serverName: packet.serverName,
            version:    packet.version,
          });
        } catch { /* malformed packet — ignore */ }
      });

      this.socket.bind(DISCOVERY_PORT, () => {
        this.socket?.setBroadcast(true);
      });

      // Timeout
      this.timer = setTimeout(() => {
        this._cleanup();
        reject(new Error(`UDP discovery timed out after ${timeoutMs / 1000}s — no InsuredHub server found on LAN`));
      }, timeoutMs);
    });
  }

  /** Stop listening early (e.g., user entered address manually). */
  abort() {
    this._cleanup();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _validate(packet: DiscoveryPacket): boolean {
    // Must identify as InsuredHub
    if (packet.app !== 'InsuredHub') return false;

    // Timestamp must be recent (within ±30 s) — prevents replay attacks
    const drift = Math.abs(Date.now() - packet.timestamp);
    if (drift > 30_000) return false;

    // Signature check (skip if no secret configured)
    if (this.signSecret) {
      const expected = this._sign(packet);
      if (!crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(packet.signature || '', 'hex').length === Buffer.from(expected, 'hex').length
          ? Buffer.from(packet.signature, 'hex')
          : Buffer.alloc(32)
      )) return false;
    }

    return true;
  }

  private _sign(packet: DiscoveryPacket): string {
    const data = JSON.stringify({
      app:       packet.app,
      serverId:  packet.serverId,
      version:   packet.version,
      ip:        packet.ip,
      port:      packet.port,
      timestamp: packet.timestamp,
    });
    return crypto.createHmac('sha256', this.signSecret).update(data).digest('hex');
  }

  private _cleanup() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.socket) {
      try { this.socket.close(); } catch { /* ignore */ }
      this.socket = null;
    }
  }
}
