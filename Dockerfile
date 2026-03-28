# Stage 1: Go
FROM golang:1.26.1-alpine AS go-builder
WORKDIR /build

COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
    -o my-mind ./cmd/server

# Stage 2: runtime
FROM alpine:3.23
RUN apk add --no-cache ca-certificates su-exec busybox-extras tzdata

COPY --from=go-builder /build/my-mind /usr/local/bin/my-mind
COPY static/ /app/static/

WORKDIR /app
EXPOSE 3000
ENTRYPOINT ["my-mind"]
