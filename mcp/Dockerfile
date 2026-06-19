# 使用 Node.js 官方 Alpine 镜像作为基础
FROM node:20-alpine

# 配置腾讯云镜像源
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ \
    && yarn config set registry https://mirrors.cloud.tencent.com/npm/
    
# 配置 Alpine 国内镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tencent.com/g' /etc/apk/repositories

# 安装 Python（自动创建 python/pip 链接）
RUN apk update \
    && apk add --no-cache python3 py3-pip \
    && apk add curl

# 如果你的项目是一个 python 项目，推荐全局安装，提升运行态的性能
# 例如 RUN pip3 install --break-system-packages mysql-mcp-server
RUN pip3 install --break-system-packages uv     

## 全局安装必须的 npm 依赖
## @cloudbase/mcp-transformer 必须安装
## 如果你的项目是一个 npm 包，推荐全局安装，提升运行态的性能
RUN npm install -g @cloudbase/mcp-transformer @cloudbase/cloudbase-mcp

# 固定暴露端口
EXPOSE 80

# 启动命令
## 这里是使用 cloudbase-mcp-transformer 命令来将 Stdio 转换为远程 MCP 服务
## --stdioCmd 是指定需要转换的命令，其中可以引用环境变量，例如 $USER、$PASSWORD、$HOST、$PORT、$DATABASE
## 在创建云托管服务的时候，用户可以指定环境变量
## 如果你的项目依赖环境变量，需要在 mcp-meta.json 中进行声明
## --port 是指定转换后的服务端口，默认为 3000
CMD cloudbase-mcp-transformer stdioToCloudrun --stdioCmd "cloudbase-mcp" --port 3000