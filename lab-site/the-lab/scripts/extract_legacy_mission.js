const fs = require('fs');
const path = require('path');

// Mock content to extract from the source code directly or just copy paste the object
// Since I can't easily import the component file due to imports, I'll just paste the object here structure.
// Wait, I can read the file as text and regex out the JSON object, or just manually reconstruct it since I have it in history.
// Listing the file again to execute the extraction programmatically is safer and more complete.

const BASE_FILE_SYSTEM_RAW = {
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
  }
};

const ROOT_OUTPUT = path.join(__dirname, '../vps/missions/legacy/files');

if (!fs.existsSync(ROOT_OUTPUT)) {
    fs.mkdirSync(ROOT_OUTPUT, { recursive: true });
}

function processNode(node, currentPath) {
    if (node.type === 'file') {
        fs.writeFileSync(currentPath, node.content);
        console.log(`Created file: ${currentPath}`);
    } else if (node.type === 'dir') {
        if (!fs.existsSync(currentPath)) {
            fs.mkdirSync(currentPath, { recursive: true });
        }
        for (const [name, child] of Object.entries(node.children)) {
            processNode(child, path.join(currentPath, name));
        }
    }
}

// Map '~' to 'home/hacker'
// Map 'etc' to 'etc_mock' to avoid overwriting system files in docker for now (we'll copy them to /etc in Dockerfile)
// Map 'var' to 'var_mock'

const MAPPINGS = {
    '~': 'home/hacker',
    'etc': 'root_fs/etc',
    'var': 'root_fs/var'
};

async function main() {
    for (const [key, node] of Object.entries(BASE_FILE_SYSTEM_RAW)) {
        if (MAPPINGS[key]) {
             const dest = path.join(ROOT_OUTPUT, MAPPINGS[key]);
             processNode(node, dest);
        } else {
             // Stuff like 'bin' we skip or put in root_fs
             console.log(`Skipping top level ${key} for now`);
        }
    }
    console.log("Extraction complete.");
}

main();
