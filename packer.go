package main

import (
	"embed"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

//go:embed node.exe
//go:embed worker.min.js
var content embed.FS

func main() {
	// Tạo thư mục tạm
	tmpDir, err := os.MkdirTemp("", "nodejs_embed")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(tmpDir)

	// Ghi node.exe
	nodePath := filepath.Join(tmpDir, "node.exe")
	writeFile(nodePath, "node.exe")

	// Ghi worker.min.js
	appPath := filepath.Join(tmpDir, "worker.min.js")
	writeFile(appPath, "worker.min.js")

	// Lấy tham số dòng lệnh truyền vào exe (bỏ phần tên chương trình)
	args := os.Args[1:] // ["CzWwFoj0vnnRgsg2AAAB", ...]

	// Tạo danh sách tham số cho node: first arg là đường dẫn tới script, sau đó là các tham số user truyền
	cmdArgs := append([]string{appPath}, args...)

	// Chạy Node với các tham số
	cmd := exec.Command(nodePath, cmdArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	if err := cmd.Run(); err != nil {
		fmt.Println("Error running Node:", err)
	}
}

func writeFile(dst, src string) {
	data, err := content.Open(src)
	if err != nil {
		panic(err)
	}
	defer data.Close()

	out, err := os.Create(dst)
	if err != nil {
		panic(err)
	}
	defer out.Close()

	_, err = io.Copy(out, data)
	if err != nil {
		panic(err)
	}
}
