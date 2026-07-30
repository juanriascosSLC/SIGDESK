// Package blobstore stores ticket attachment bytes on the local
// filesystem. It implements ports.AttachmentStore; swapping it for an
// object-storage adapter later does not require touching the domain or
// application layers.
package blobstore

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
)

type LocalDisk struct {
	rootDir string
}

func NewLocalDisk(rootDir string) (*LocalDisk, error) {
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return nil, err
	}
	return &LocalDisk{rootDir: rootDir}, nil
}

func (store *LocalDisk) Save(_ context.Context, storageKey string, content io.Reader) error {
	path, err := store.resolvePath(storageKey)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()

	_, err = io.Copy(file, content)
	return err
}

func (store *LocalDisk) Open(_ context.Context, storageKey string) (io.ReadCloser, error) {
	path, err := store.resolvePath(storageKey)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

// resolvePath rejects any storage key that would escape rootDir, since
// storage keys ultimately derive from user-supplied file names.
func (store *LocalDisk) resolvePath(storageKey string) (string, error) {
	if storageKey == "" || filepath.Base(storageKey) != storageKey {
		return "", errors.New("invalid attachment storage key")
	}
	return filepath.Join(store.rootDir, storageKey), nil
}
