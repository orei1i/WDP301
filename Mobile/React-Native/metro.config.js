// Cấu hình Metro cho monorepo npm workspaces.
//
// Mặc định Metro chỉ theo dõi thư mục project và chỉ tìm node_modules đi lên từ đó. Trong workspace
// thì phần lớn package bị hoist lên node_modules ở gốc, còn @ssm/shared là symlink trỏ sang
// ../../shared — cả hai đều nằm NGOÀI thư mục project, nên phải khai báo:
//   watchFolders      → Metro theo dõi thay đổi ở shared, sửa type là app reload
//   nodeModulesPaths  → tìm package ở cả hai chỗ (project và gốc workspace)
//
// CỐ Ý KHÔNG đặt disableHierarchicalLookup. Tùy chọn đó tắt cơ chế dò lên từng cấp node_modules,
// chỉ hợp khi mọi package được hoist phẳng lên gốc. Với npm workspaces thì npm vẫn để một số
// package lồng bên trong dependency khác (ví dụ @expo/metro-runtime nằm trong expo-router/node_modules)
// — tắt đi là Metro báo "Unable to resolve" đúng những package đã cài.
//
// @ssm/shared xuất TypeScript thô (main: src/index.ts). Metro có chạy babel cho file trong
// node_modules nên nuốt được TS, khác với webpack — đây là lý do cách này hoạt động.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
