/**
 * UDPDiscoveryClientService — client-side LAN server discovery.
 *
 * Listens for Admin PC UDP broadcasts on port 47912 and resolves the
 * Admin address automatically (no manual IP entry).
 */

import * as dgram from 'dgram';

export const DISCOVERY_PORT = 47912;
export const DISCOVERY_TIMEOUT_MS = 25_000;

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
}

export interface DiscoveryResult {
  ip: string;
  advertisedIp?: string;
  port: number;
  serverId: string;
  serverName: string;
  version: string;
}

export class UDPDiscoveryClientService {
  private socket: dgram.Socket | null = null;
  private timer: NodeJS.Timeout | null = null;
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
          if (!this._validate(packet)) return;

          // The UDP sender address is the interface that actually reached this
          // Employee PC. The advertised address can be a VPN/VM adapter and is
          // therefore only retained as a fallback hint.
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

      // Bind to all interfaces so Wi‑Fi broadcasts are received (esp. on Windows)
      this.socket.bind({ port: DISCOVERY_PORT, address: '0.0.0.0', exclusive: false }, () => {
        try {
          this.socket?.setBroadcast(true);
        } catch {
          /* ignore */
        }
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

  private _validate(packet: DiscoveryPacket): boolean {
    if (packet.app !== 'InsuredHub') return false;
    if (!packet.port) return false;

    // Allow generous clock skew (5 minutes) — Windows vs Mac clocks often drift
    const drift = Math.abs(Date.now() - Number(packet.timestamp || 0));
    if (!packet.timestamp || drift > 300_000) return false;

    // HMAC only when both sides share a secret (Employee PCs usually pass '')
    if (this.signSecret) {
      // Soft-fail: don't block discovery on signature mismatch in the field
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
