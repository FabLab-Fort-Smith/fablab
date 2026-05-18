FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Flag 3: readable via `env` — rewards knowing about environment variables
ENV SYSTEM_FLAG=flag{hack_the_planet}

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    nano \
    iputils-ping \
    net-tools \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install ttyd
# Using a fixed version for stability
RUN curl -L https://github.com/tsl0922/ttyd/releases/download/1.7.3/ttyd.x86_64 -o /usr/bin/ttyd \
    && chmod +x /usr/bin/ttyd

# Create hacker user
RUN useradd -m -s /bin/bash hacker
WORKDIR /home/hacker

# Create data directory for volume mount
RUN mkdir /home/hacker/data && chown hacker:hacker /home/hacker/data

# Set up a nice prompt
RUN echo 'export PS1="\[\033[01;32m\]\u@thelab\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ "' >> /home/hacker/.bashrc

# Run mission setup (creates README, flag files, easter eggs)
COPY setup.sh /tmp/setup.sh
RUN bash /tmp/setup.sh && rm /tmp/setup.sh

# Switch to user
USER hacker

# Expose the port
EXPOSE 8080

# Default command (usually overridden by Orchestrator)
CMD ["ttyd", "-p", "8080", "bash"]
