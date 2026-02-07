package gost

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

type ProcessManager struct {
	BinaryPath string
	ConfigPath string
	LogPath    string
	cmd        *exec.Cmd
	pid        int
}

func NewProcessManager(binaryPath, configPath, logPath string) *ProcessManager {
	return &ProcessManager{
		BinaryPath: binaryPath,
		ConfigPath: configPath,
		LogPath:    logPath,
	}
}

// Start 启动 Gost 进程
func (pm *ProcessManager) Start() error {
	// 检查是否已经在运行
	if pm.IsRunning() {
		return fmt.Errorf("gost process is already running")
	}

	// 检查二进制文件是否存在
	if _, err := os.Stat(pm.BinaryPath); os.IsNotExist(err) {
		return fmt.Errorf("gost binary not found at %s", pm.BinaryPath)
	}

	// 检查配置文件是否存在
	if _, err := os.Stat(pm.ConfigPath); os.IsNotExist(err) {
		return fmt.Errorf("gost config not found at %s", pm.ConfigPath)
	}

	// 创建日志文件
	logFile, err := os.OpenFile(pm.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to create log file: %w", err)
	}

	// 启动进程
	pm.cmd = exec.Command(pm.BinaryPath, "-C", pm.ConfigPath)
	pm.cmd.Stdout = logFile
	pm.cmd.Stderr = logFile
	pm.cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}

	if err := pm.cmd.Start(); err != nil {
		logFile.Close()
		return fmt.Errorf("failed to start gost: %w", err)
	}

	pm.pid = pm.cmd.Process.Pid
	return nil
}

// Stop 停止 Gost 进程
func (pm *ProcessManager) Stop() error {
	if !pm.IsRunning() {
		return fmt.Errorf("gost process is not running")
	}

	// 发送 SIGTERM 信号
	if err := pm.cmd.Process.Signal(syscall.SIGTERM); err != nil {
		// 如果 SIGTERM 失败,尝试 SIGKILL
		if err := pm.cmd.Process.Kill(); err != nil {
			return fmt.Errorf("failed to kill gost process: %w", err)
		}
	}

	// 等待进程退出
	pm.cmd.Wait()
	pm.pid = 0
	pm.cmd = nil

	return nil
}

// Restart 重启 Gost 进程
func (pm *ProcessManager) Restart() error {
	if pm.IsRunning() {
		if err := pm.Stop(); err != nil {
			return fmt.Errorf("failed to stop gost: %w", err)
		}
	}

	return pm.Start()
}

// IsRunning 检查 Gost 进程是否在运行
func (pm *ProcessManager) IsRunning() bool {
	if pm.cmd == nil || pm.cmd.Process == nil {
		return false
	}

	// 检查进程是否存在
	process, err := os.FindProcess(pm.pid)
	if err != nil {
		return false
	}

	// 发送信号 0 检查进程是否存活
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// GetPID 获取进程 PID
func (pm *ProcessManager) GetPID() int {
	return pm.pid
}
