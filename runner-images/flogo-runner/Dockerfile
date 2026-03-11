FROM golang:1.24-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl jq git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Install the Flogo CLI into the runner image.
RUN go install github.com/project-flogo/cli/...@latest

COPY go-runtime/flogo-helper /tmp/flogo-helper
RUN cd /tmp/flogo-helper && go build -o /usr/local/bin/flogo-helper .

ENV PATH="/root/go/bin:${PATH}"

CMD ["bash"]
