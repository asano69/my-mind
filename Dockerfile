# Stage 1: Go
FROM golang:1.26.1-alpine AS go-builder
WORKDIR /build
COPY go.mod go.sum* ./
RUN go mod download || true
# Copy only Go source so the build cache is not invalidated by changes to
# static assets or other non-Go files.
COPY cmd/ ./cmd/
COPY internal/ ./internal/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" \
    -o /usr/local/bin/my-mind ./cmd/my-mind
# Stage 2: runtime
FROM alpine:3.23
RUN apk add --no-cache ca-certificates su-exec busybox-extras tzdata
COPY --from=go-builder /usr/local/bin/my-mind /usr/local/bin/my-mind
COPY static/ /app/static/
WORKDIR /app
EXPOSE 3000
ENTRYPOINT ["my-mind"]
