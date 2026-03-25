# Stage 1: Go
FROM golang:1.26.1-alpine AS go-builder
WORKDIR /build
COPY go.mod go.sum* ./
RUN go mod download || true
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o hashwrap .

# Stage 2: runtime
FROM alpine:3.23
RUN apk add --no-cache ca-certificates su-exec busybox-extras
COPY --from=rust-builder /usr/local/cargo/bin/hashcards /usr/local/bin/hashcards
COPY --from=go-builder   /build/hashwrap                /usr/local/bin/hashwrap
COPY pwa/                /app/pwa/
COPY entrypoint.sh       /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /app/data
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
