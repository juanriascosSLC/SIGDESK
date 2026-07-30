FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/sig-desk-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/sig-desk-api /sig-desk-api
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/sig-desk-api"]
