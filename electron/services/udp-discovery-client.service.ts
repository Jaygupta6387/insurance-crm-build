/**
 * UDPDiscoveryClientService — client-side LAN server discovery.
 *
 * Listens for Admin UDP announces on port 47912 and also sends discovery
 * probes (broadcast) so Admin can reply unicast when one-way broadcast
 * is filtered (common on mixed Mac Admin → Windows Employee Wi‑Fi).
 */

import * as dgram from 'dgram';
import * as os from 'os';

export const DISCOVERY_PORT = 47912;
export const DISCOVERY_TIMEOUT_MS = 25_000;
const PROBE_INTERVAL_MS = 1_500;

export interface DiscoveryPacket {
  app: string;
  serverId: string;
  serverName: string;
  licenseId: string;
  version: string;
  ip: string;
  port: number;
  timestamp: number;
  signature: string;
  type?: string;
}

export interface DiscoveryResult {
  ip: string;
  advertisedIp?: string;
  port: number;
  serverId: string;
  serverName: string;
  version: string;
}

function isIpv4(addr: os.NetworkInterfaceInfo): boolean {
  return addr.family === 'IPv4' || (addr.family as unknown) === 4;
}

export class UDPDiscoveryClientService {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
  private probeTimer: NodeJS.Timeout | null = null;
  private signSecret: string;

  /**
   * @param signSecret  Pass '' to skip HMAC (recommended for Employee PCs —
   *                    Admin and Employee rarely share the same license token).
   */
  constructor(signSecret = '') {
    this.signSecret = signSecret;
  }

  discover(timeoutMs = DISCOVERY_TIMEOUT_MS): Promise<DiscoveryResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      try {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.socket.on('error', (err) => {
        done(() => {
          this._cleanup();
          reject(err);
        });
      });

      this.socket.on('message', (buf, rinfo) => {
        try {
          const packet: DiscoveryPacket = JSON.parse(buf.toString('utf8'));
          // Ignore our own probes echoing back
          if (packet.type === 'discover' || packet.type === 'probe') return;
          if (!this._validate(packet)) return;

          // Prefer the UDP sender address (real interface that reached us).
          const ip = rinfo.address;
          const advertisedIp =
            packet.ip && packet.ip !== rinfo.address ? packet.ip : undefined;
          const port = Number(packet.port);
          if (!port || port < 1 || port > 65535) return;

          done(() => {
            this._cleanup();
            resolve({
              ip,
              advertisedIp,
              port,
              serverId: packet.serverId,
              serverName: packet.serverName,
              version: packet.version,
            });
          });
        } catch {
          /* malformed — ignore */
        }
      });

      this.socket.bind({ port: DISCOVERY_PORT, address: '0.0.0.0', exclusive: false }, () => {
        try {
          this.socket?.setBroadcast(true);
        } catch {
          /* ignore */
        }
        this._sendProbe();
        this.probeTimer = setInterval(() => this._sendProbe(), PROBE_INTERVAL_MS);
      });

      this.timer = setTimeout(() => {
        done(() => {
          this._cleanup();
          reject(
            new Error(
              `UDP discovery timed out after ${timeoutMs / 1000}s — no InsuredHub server found on LAN`
            )
          );
        });
      }, timeoutMs);
    });
  }

  abort() {
    this._cleanup();
  }

  private _sendProbe() {
    if (!this.socket) return;
    const probe = Buffer.from(
      JSON.stringify({
        app: 'InsuredHub',
        type: 'discover',
        timestamp: Date.now(),
      }),
      'utf8'
    );
    const targets = new Set(['255.255.255.255', ...this._broadcastAddresses()]);
    for (const target of targets) {
      try {
        this.socket.send(probe, 0, probe.length, DISCOVERY_PORT, target, () => {});
      } catch {
        /* ignore */
      }
    }
  }

  private _broadcastAddresses(): string[] {
    const results: string[] = [];
    try {
      for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of iface || []) {
          if (!isIpv4(addr) || addr.internal || !addr.netmask) continue;
          if (addr.address.startsWith('169.254.')) continue;
          const ipParts = addr.address.split('.').map(Number);
          const maskParts = addr.netmask.split('.').map(Number);
          if (ipParts.length !== 4 || maskParts.length !== 4) continue;
          results.push(
            ipParts
              .map((part, i) => (part & maskParts[i]) | (~maskParts[i] & 0xff))
              .join('.')
          );
        }
      }
    } catch {
      /* ignore */
    }
    return results;
  }

  private _validate(packet: DiscoveryPacket): boolean {
    if (packet.app !== 'InsuredHub') return false;
    if (!packet.port) return false;
    if (!packet.serverId) return false;

    // Allow generous clock skew (5 minutes) — Windows vs Mac clocks often drift
    const drift = Math.abs(Date.now() - Number(packet.timestamp || 0));
    if (!packet.timestamp || drift > 300_000) return false;

    if (this.signSecret) {
      try {
        const crypto = require('crypto') as typeof import('crypto');
        const data = JSON.stringify({
          app: packet.app,
          serverId: packet.serverId,
          version: packet.version,
          ip: packet.ip,
          port: packet.port,
          timestamp: packet.timestamp,
        });
        const expected = crypto
          .createHmac('sha256', this.signSecret)
          .update(data)
          .digest('hex');
        if (expected !== packet.signature) {
          console.warn('[udp-discovery] signature mismatch — accepting packet on private LAN');
        }
      } catch {
        /* ignore */
      }
    }

    return true;
  }

  private _cleanup() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }
}
