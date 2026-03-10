# 用户权限管理云API设计 - 完整版

> **接口请求域名**：`tcb.tencentcloudapi.com`  
> **公共参数 Version**：`2018-06-08`  
> **默认接口请求频率限制**：20次/秒

---

## 目录

- [一、用户管理](#一用户管理)
  - [1. 创建TCB用户](#1-创建tcb用户createuser)
  - [2. 查询TCB用户列表](#2-查询tcb用户列表describeuserlist)
  - [3. 更新TCB用户](#3-更新tcb用户modifyuser)
  - [4. 删除TCB用户](#4-删除tcb用户deleteusers)
- [二、权限管理](#二权限管理)
  - [5. 修改资源基础权限](#5-修改资源基础权限modifyresourcepermission)
  - [6. 查询资源基础权限](#6-查询资源基础权限describeresourcepermission)
  - [7. 创建角色](#7-创建角色createrole)
  - [8. 查询角色列表](#8-查询角色列表describerolelist)
  - [9. 修改角色](#9-修改角色modifyrole)
  - [10. 删除角色](#10-删除角色deleteroles)
- [三、数据结构汇总](#三数据结构汇总)
- [四、接口总览](#四接口总览)
- [五、登录认证管理](#五登录认证管理)
  - [5.1 第三方认证源管理](#一第三方认证源管理)
  - [5.2 应用客户端管理](#二应用客户端管理)
  - [5.3 API Key 管理](#三api-key-管理)
  - [5.4 自定义登录](#四自定义登录)
  - [5.5 登录认证数据结构](#五数据结构)

---

## 一、用户管理

### 1. 创建TCB用户（CreateUser）

#### 1.1 接口描述

创建tcb用户。

#### 1.2 输入参数

| 参数名称    | 必选 | 类型   | 描述                                                                                                                                                                                                               |
| :---------- | :--- | :----- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action      | 是   | String | 公共参数，本接口取值：`CreateUser`                                                                                                                                                                               |
| Version     | 是   | String | 公共参数，本接口取值：`2018-06-08`                                                                                                                                                                               |
| Region      | 否   | String | 公共参数，本接口不需要传递此参数                                                                                                                                                                                   |
| EnvId       | 是   | String | 环境ID `<br>`示例值：`test-envId`                                                                                                                                                                              |
| Name        | 是   | String | 用户名，用户名规则：1. 长度1-64字符 2. 只能包含大小写英文字母、数字和符号 . _ - 3. 只能以字母或数字开头 4. 不能重复 `<br>`示例值：`zhangsan`                                                                   |
| Uid         | 否   | String | 用户ID，最多64字符，如不传则系统自动生成 `<br>`示例值：`1001`                                                                                                                                                  |
| Type        | 否   | String | 用户类型：internalUser-内部用户、externalUser-外部用户，默认internalUser（内部用户）`<br>`示例值：`internalUser`                                                                                               |
| Password    | 否   | String | 密码，传入Uid时密码可不传。密码规则：1. 长度8-32字符（推荐12位以上） 2. 不能以特殊字符开头 3. 至少包含以下四项中的三项：小写字母a-z、大写字母A-Z、数字0-9、特殊字符()!@#$%^&*\|?><_-`<br>`示例值：`Abc@123456` |
| UserStatus  | 否   | String | 用户状态：ACTIVE（激活）、BLOCKED（冻结），默认激活 `<br>`示例值：`ACTIVE`                                                                                                                                     |
| NickName    | 否   | String | 用户昵称，长度2-64字符 `<br>`示例值：`张三`                                                                                                                                                                    |
| Phone       | 否   | String | 手机号，不能重复 `<br>`示例值：`13800138000`                                                                                                                                                                   |
| Email       | 否   | String | 邮箱地址，不能重复 `<br>`示例值：`zhangsan@example.com`                                                                                                                                                        |
| AvatarUrl   | 否   | String | 头像链接，可访问的公网URL `<br>`示例值：`https://example.com/avatars/zhangsan.jpg`                                                                                                                             |
| Description | 否   | String | 用户描述，最多200字符 `<br>`示例值：`用户描述`                                                                                                                                                                 |

#### 1.3 输出参数

| 参数名称  | 类型           | 描述                                        |
| :-------- | :------------- | :------------------------------------------ |
| Data      | CreateUserResp | 结果返回                                    |
| RequestId | String         | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**CreateUserResp 结构：**

| 参数名称 | 类型   | 描述   |
| :------- | :----- | :----- |
| Uid      | String | 用户ID |

#### 1.4 示例

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateUser
<公共请求参数>

{
    "EnvId": "test-envId",
    "Name": "zhangsan",
    "Uid": "1001",
    "Type": "internalUser",
    "Password": "Abc@123456",
    "UserStatus": "ACTIVE",
    "NickName": "张三",
    "Phone": "13800138000",
    "Email": "zhangsan@example.com",
    "AvatarUrl": "https://example.com/avatars/zhangsan.jpg",
    "Description": "研发部门员工"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Uid": "1001"
        },
        "RequestId": "af638232-4d1c-4e41-b959-ea3dbe5de0be"
    }
}
```

#### 1.5 错误码

| 错误码                                | 描述                       |
| :------------------------------------ | :------------------------- |
| AuthFailure                           | CAM签名/鉴权错误           |
| FailedOperation                       | 操作失败                   |
| FailedOperation.DuplicatedData        | 数据重复（如用户名已存在） |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期             |
| InternalError                         | 内部错误                   |
| ResourceNotFound                      | 资源不存在                 |

> 参考文档：https://cloud.tencent.com/document/api/876/127961

---

### 2. 查询TCB用户列表（DescribeUserList）

#### 2.1 接口描述

查询tcb用户列表。

#### 2.2 输入参数

| 参数名称 | 必选 | 类型    | 描述                                                        |
| :------- | :--- | :------ | :---------------------------------------------------------- |
| Action   | 是   | String  | 公共参数，本接口取值：`DescribeUserList`                  |
| Version  | 是   | String  | 公共参数，本接口取值：`2018-06-08`                        |
| Region   | 否   | String  | 公共参数，本接口不需要传递此参数                            |
| EnvId    | 是   | String  | 环境ID `<br>`示例值：`test-envId`                       |
| PageNo   | 否   | Integer | 页码，从1开始，默认为1 `<br>`示例值：`1`                |
| PageSize | 否   | Integer | 每页数量，默认20，最大100 `<br>`示例值：`10`            |
| Name     | 否   | String  | 用户名，支持模糊查询 `<br>`示例值：`zhang`              |
| NickName | 否   | String  | 用户昵称，支持模糊查询 `<br>`示例值：`张`               |
| Phone    | 否   | String  | 手机号，支持模糊查询 `<br>`示例值：`13900139000`        |
| Email    | 否   | String  | 邮箱，支持模糊查询 `<br>`示例值：`zhangsan@example.com` |

#### 2.3 输出参数

| 参数名称  | 类型                 | 描述                                        |
| :-------- | :------------------- | :------------------------------------------ |
| Data      | DescribeUserListResp | 结果返回                                    |
| RequestId | String               | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**DescribeUserListResp 结构：**

| 参数名称 | 类型              | 描述     |
| :------- | :---------------- | :------- |
| Total    | Integer           | 用户总数 |
| UserList | Array of UserInfo | 用户列表 |

**UserInfo 结构：**

| 参数名称    | 类型   | 描述                                  |
| :---------- | :----- | :------------------------------------ |
| Uid         | String | 用户ID                                |
| Name        | String | 用户名                                |
| NickName    | String | 用户昵称                              |
| Phone       | String | 手机号                                |
| Email       | String | 邮箱                                  |
| AvatarUrl   | String | 头像地址                              |
| UserStatus  | String | 用户状态（ACTIVE/BLOCKED）            |
| Type        | String | 用户类型（internalUser/externalUser） |
| Description | String | 用户描述                              |

#### 2.4 示例

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeUserList
<公共请求参数>

{
    "EnvId": "test-envId",
    "PageNo": 1,
    "PageSize": 10,
    "Name": "zhang",
    "NickName": "张",
    "Phone": "13900139000",
    "Email": "zhangsan@example.com"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Total": 100,
            "UserList": [
                {
                    "Uid": "1001",
                    "Name": "zhangsan",
                    "NickName": "张三",
                    "Phone": "13800138000",
                    "Email": "zhangsan@example.com",
                    "AvatarUrl": "https://example.com/avatars/zhangsan.jpg",
                    "UserStatus": "ACTIVE",
                    "Type": "internalUser",
                    "Description": "研发部门技术总监"
                }
            ]
        },
        "RequestId": "eb985f06-ebb2-4d1f-a224-2f5bdc0c4eb4"
    }
}
```

#### 2.5 错误码

| 错误码                                | 描述             |
| :------------------------------------ | :--------------- |
| AuthFailure                           | CAM签名/鉴权错误 |
| FailedOperation                       | 操作失败         |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期   |
| InternalError                         | 内部错误         |
| ResourceNotFound                      | 资源不存在       |

> 参考文档：https://cloud.tencent.com/document/api/876/127959

---

### 3. 更新TCB用户（ModifyUser）

#### 3.1 接口描述

修改指定环境下的TCB用户信息（如用户名、密码、状态等）。

#### 3.2 输入参数

| 参数名称    | 必选 | 类型   | 描述                                                                                                                                                                        |
| :---------- | :--- | :----- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action      | 是   | String | 公共参数，本接口取值：`ModifyUser`                                                                                                                                        |
| Version     | 是   | String | 公共参数，本接口取值：`2018-06-08`                                                                                                                                        |
| Region      | 否   | String | 公共参数，本接口不需要传递此参数                                                                                                                                            |
| EnvId       | 是   | String | 环境ID `<br>`示例值：`testenv-123`                                                                                                                                      |
| Uid         | 是   | String | 用户ID（不可修改，仅作标识）`<br>`示例值：`1001`                                                                                                                        |
| Name        | 否   | String | 用户名。规则：长度1-64字符；只能包含大小写英文字母、数字和符号 . _ -；只能以字母或数字开头；不能重复。不传或传空则不修改 `<br>`示例值：`test_user_01`                   |
| Type        | 否   | String | 用户类型：internalUser-内部用户、externalUser-外部用户。不传或传空则不修改 `<br>`示例值：`internalUser`                                                                 |
| Password    | 否   | String | 密码。规则：长度8-32字符（推荐12位以上）；不能以特殊字符开头；至少包含以下四项中的三项：小写字母、大写字母、数字、特殊字符。不传或传空则不修改 `<br>`示例值：`test123@` |
| UserStatus  | 否   | String | 用户状态：ACTIVE（激活）、BLOCKED（冻结）。不传或传空则不修改 `<br>`示例值：`ACTIVE`                                                                                    |
| NickName    | 否   | String | 用户昵称，长度2-64字符。不传不修改，传空字符则修改为空 `<br>`示例值：`test_user_01`                                                                                     |
| Phone       | 否   | String | 手机号，11位数字。不传不修改，传空字符串则修改为空 `<br>`示例值：`18xxxx9078`                                                                                           |
| Email       | 否   | String | 邮箱地址。不传不修改，传空字符则修改为空 `<br>`示例值：`example@qq.com`                                                                                                 |
| AvatarUrl   | 否   | String | 头像链接，可访问的公网URL。不传不修改，传空字符则修改为空 `<br>`示例值：`https://example.com/avatar.jpg`                                                                |
| Description | 否   | String | 用户描述，最多200字符。不传不修改，传空字符则修改为空 `<br>`示例值：`测试账号`                                                                                          |

#### 3.3 输出参数

| 参数名称  | 类型           | 描述                                                        |
| :-------- | :------------- | :---------------------------------------------------------- |
| Data      | ModifyUserResp | 修改用户返回值。注意：此字段可能返回 null，表示取不到有效值 |
| RequestId | String         | 唯一请求 ID，由服务端生成，每次请求都会返回                 |

**ModifyUserResp 结构：**

| 参数名称 | 类型    | 描述         |
| :------- | :------ | :----------- |
| Success  | Boolean | 是否修改成功 |

#### 3.4 示例

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ModifyUser
<公共请求参数>

{
    "EnvId": "testenv-123",
    "Uid": "1001",
    "Name": "test_user_01",
    "Type": "internalUser",
    "Password": "test123@",
    "UserStatus": "ACTIVE",
    "NickName": "test_user_01",
    "Phone": "18xxxx9078",
    "Email": "example@qq.com",
    "AvatarUrl": "https://example.com/avatar.jpg",
    "Description": "测试账号"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Success": true
        },
        "RequestId": "76c0ca0f-4cf2-4f89-80b9-cdbf9ab7dd77"
    }
}
```

#### 3.5 错误码

| 错误码                                | 描述                       |
| :------------------------------------ | :------------------------- |
| AuthFailure                           | CAM签名/鉴权错误           |
| FailedOperation                       | 操作失败                   |
| FailedOperation.DuplicatedData        | 数据重复（如用户名已存在） |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期             |
| InternalError                         | 内部错误                   |
| InvalidParameter                      | 参数错误                   |
| InvalidParameter.INVALID_PARAM        | 请求参数错误               |
| InvalidParameterValue                 | 参数取值错误               |
| ResourceNotFound                      | 资源不存在                 |
| ResourceNotFound.UserNotExist         | 用户不存在                 |
| ResourceNotFound.UserNotExists        | 用户不存在                 |

> 参考文档：https://cloud.tencent.com/document/api/876/127958

---

### 4. 删除TCB用户（DeleteUsers）

#### 4.1 接口描述

批量删除tcb用户。

#### 4.2 输入参数

| 参数名称 | 必选 | 类型            | 描述                                                                           |
| :------- | :--- | :-------------- | :----------------------------------------------------------------------------- |
| Action   | 是   | String          | 公共参数，本接口取值：`DeleteUsers`                                          |
| Version  | 是   | String          | 公共参数，本接口取值：`2018-06-08`                                           |
| Region   | 否   | String          | 公共参数，本接口不需要传递此参数                                               |
| EnvId    | 是   | String          | 环境ID `<br>`示例值：`testenv-123`                                         |
| Uids.N   | 是   | Array of String | TCB用户ID列表，一次最多支持删除100个 `<br>`示例值：`["19837204372934434"]` |

#### 4.3 输出参数

| 参数名称  | 类型            | 描述                                        |
| :-------- | :-------------- | :------------------------------------------ |
| Data      | DeleteUsersResp | 删除用户结果                                |
| RequestId | String          | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**DeleteUsersResp 结构：**

| 参数名称     | 类型    | 描述               |
| :----------- | :------ | :----------------- |
| SuccessCount | Integer | 成功删除的用户数量 |
| FailedCount  | Integer | 删除失败的用户数量 |

#### 4.4 示例

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DeleteUsers
<公共请求参数>

{
    "EnvId": "testenv-123",
    "Uids": [
        "19837204372934434"
    ]
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "SuccessCount": 1,
            "FailedCount": 0
        },
        "RequestId": "563b4e8e-7898-401d-95b1-c86bbaecc6b3"
    }
}
```

#### 4.5 错误码

| 错误码           | 描述             |
| :--------------- | :--------------- |
| AuthFailure      | CAM签名/鉴权错误 |
| FailedOperation  | 操作失败         |
| InternalError    | 内部错误         |
| ResourceNotFound | 资源不存在       |

> 参考文档：https://cloud.tencent.com/document/api/876/127960

---

## 二、权限管理

### 5. 修改资源基础权限（ModifyResourcePermission）

#### 5.1 接口描述

修改云函数、云存储和数据库表的基础权限配置。支持预定义权限级别和自定义安全规则两种方式配置资源访问权限。

#### 5.2 输入参数

| 参数名称     | 必选 | 类型   | 描述                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| :----------- | :--- | :----- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action       | 是   | String | 公共参数，本接口取值：`ModifyResourcePermission`                                                                                                                                                                                                                                                                                                                                                                                             |
| Version      | 是   | String | 公共参数，本接口取值：`2018-06-08`                                                                                                                                                                                                                                                                                                                                                                                                           |
| Region       | 否   | String | 公共参数，本接口不需要传递此参数                                                                                                                                                                                                                                                                                                                                                                                                               |
| EnvId        | 是   | String | 环境ID `<br>`示例值：`test-envId`                                                                                                                                                                                                                                                                                                                                                                                                          |
| ResourceType | 是   | String | 资源类型：`function`-云函数、`storage`-云存储、`table`-SQL型数据库表、`collection`-文档型数据库表 `<br>`示例值：`table`                                                                                                                                                                                                                                                                                                                                |
| Resource     | 是   | String | 资源标识。云函数传函数名、云存储传存储桶名、数据库表传表名 `<br>`示例值：`users`                                                                                                                                                                                                                                                                                                                                                           |
| Permission   | 是   | String | 权限级别。可选值：`<br>`- SQL型数据库表：`READONLY`-读取全部数据，修改本人数据；`PRIVATE`-读取和修改本人数据；`ADMINWRITE`-读取全部数据，不可修改数据；`ADMINONLY`-无权限`<br>`- 文档型数据库表：`READONLY`-读取全部数据，修改本人数据；`PRIVATE`-读取和修改本人数据；`ADMINWRITE`-读取全部数据，不可修改数据；`ADMINONLY`-无权限；`CUSTOM`-自定义安全规则`<br>`- 云函数：`CUSTOM`-自定义安全规则`<br>`- 云存储（权限标签）：`READONLY`-所有用户可读，仅创建者和管理员可写；`PRIVATE`-仅创建者及管理员可读写；`ADMINWRITE`-所有用户可读，仅管理员可写；`ADMINONLY`-仅管理员可读写；`CUSTOM`-自定义安全规则 `<br>`示例值：`READONLY` |
| SecurityRule | 否   | String | 自定义安全规则配置，当Permission为 `CUSTOM`时必传。JSON字符串格式的规则表达式。配置参考：[云函数安全规则](https://docs.cloudbase.net/cloud-function/security-rules)、[云存储安全规则](https://docs.cloudbase.net/storage/security-rules)、[文档型数据库安全规则](https://docs.cloudbase.net/database/security-rules) `<br>`示例值：`"{\"read\": true}"`                                                                                                                                                                                                                                                                                                                         |

#### 5.3 输出参数

| 参数名称  | 类型                         | 描述                                        |
| :-------- | :--------------------------- | :------------------------------------------ |
| Data      | ModifyResourcePermissionResp | 修改资源权限返回结果                        |
| RequestId | String                       | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**ModifyResourcePermissionResp 结构：**

| 参数名称 | 类型    | 描述         |
| :------- | :------ | :----------- |
| Success  | Boolean | 是否修改成功 |

#### 5.4 示例

**示例1：使用预定义权限配置SQL型数据库表权限**

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ModifyResourcePermission
<公共请求参数>

{
    "EnvId": "test-envId",
    "ResourceType": "table",
    "Resource": "users",
    "Permission": "READONLY"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Success": true
        },
        "RequestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    }
}
```

**示例2：使用自定义安全规则配置云函数权限**

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ModifyResourcePermission
<公共请求参数>

{
    "EnvId": "test-envId",
    "ResourceType": "function",
    "Resource": "getUserInfo",
    "Permission": "CUSTOM",
    "SecurityRule": "{\"invoke\": \"auth != null && auth.role == 'user'\"}"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Success": true
        },
        "RequestId": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
    }
}
```

**示例3：使用权限标签配置云存储权限**

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ModifyResourcePermission
<公共请求参数>

{
    "EnvId": "test-envId",
    "ResourceType": "storage",
    "Resource": "my-bucket",
    "Permission": "READONLY"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Success": true
        },
        "RequestId": "c3d4e5f6-a7b8-9012-cdef-123456789012"
    }
}
```

#### 5.5 错误码

| 错误码                                | 描述                   |
| :------------------------------------ | :--------------------- |
| AuthFailure                           | CAM签名/鉴权错误       |
| FailedOperation                       | 操作失败               |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期         |
| InternalError                         | 内部错误               |
| InvalidParameter                      | 参数错误               |
| InvalidParameterValue                 | 参数取值错误           |
| ResourceNotFound                      | 资源不存在             |
| ResourceNotFound.ResourceNotExist     | 指定的资源不存在       |
| UnsupportedOperation                  | 不支持的资源类型或操作 |

#### 5.6 接口说明

1. **权限配置方式**：

   - **预定义权限级别**：直接使用系统预定义的权限级别，简单直观，适合大多数场景
   - **自定义安全规则(CUSTOM)**：基于表达式的细粒度权限控制，支持复杂的业务逻辑
2. **资源类型与权限级别**：

   - **SQL型数据库表(table)**：支持 READONLY、PRIVATE、ADMINWRITE、ADMINONLY
   - **文档型数据库表(collection)**：支持 READONLY、PRIVATE、ADMINWRITE、ADMINONLY、CUSTOM
   - **云函数(function)**：仅支持 CUSTOM（自定义安全规则）
   - **云存储(storage，权限标签)**：支持 READONLY（所有用户可读，仅创建者和管理员可写）、PRIVATE（仅创建者及管理员可读写）、ADMINWRITE（所有用户可读，仅管理员可写）、ADMINONLY（仅管理员可读写）、CUSTOM（自定义安全规则）
3. **自定义规则**：

   - 当Permission设置为 `CUSTOM`时，必须同时传入SecurityRule参数
   - SecurityRule为JSON字符串格式的规则表达式
   - 配置参考：[云函数安全规则](https://docs.cloudbase.net/cloud-function/security-rules)、[云存储安全规则](https://docs.cloudbase.net/storage/security-rules)、[文档型数据库安全规则](https://docs.cloudbase.net/database/security-rules)
4. **全量替换**：

   - 每次调用会全量替换该资源的权限配置

---

### 6. 查询资源基础权限（DescribeResourcePermission）

#### 6.1 接口描述

查询云函数、云存储和数据库表的基础权限配置。

#### 6.2 输入参数

| 参数名称     | 必选 | 类型   | 描述                                                                                            |
| :----------- | :--- | :----- | :---------------------------------------------------------------------------------------------- |
| Action       | 是   | String | 公共参数，本接口取值：`DescribeResourcePermission`                                            |
| Version      | 是   | String | 公共参数，本接口取值：`2018-06-08`                                                            |
| Region       | 否   | String | 公共参数，本接口不需要传递此参数                                                                |
| EnvId        | 是   | String | 环境ID `<br>`示例值：`test-envId`                                                           |
| ResourceType | 是   | String | 资源类型：`function`-云函数、`storage`-云存储、`table`-SQL型数据库表、`collection`-文档型数据库表 `<br>`示例值：`table` |
| Resource     | 是   | String | 资源标识。云函数传函数名、云存储传存储桶名、数据库表传表名 `<br>`示例值：`users`            |

#### 6.3 输出参数

| 参数名称  | 类型                           | 描述                                        |
| :-------- | :----------------------------- | :------------------------------------------ |
| Data      | DescribeResourcePermissionResp | 查询资源权限返回结果                        |
| RequestId | String                         | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**DescribeResourcePermissionResp 结构：**

| 参数名称     | 类型   | 描述                                                |
| :----------- | :----- | :-------------------------------------------------- |
| ResourceType | String | 资源类型                                            |
| Resource     | String | 资源标识                                            |
| ResourceName | String | 资源名称                                            |
| Permission   | String | 权限级别，如：READONLY、PRIVATE、ADMINWRITE、ADMINONLY、CUSTOM等   |
| SecurityRule | String | 自定义安全规则配置，当Permission为 `CUSTOM`时返回。配置参考：[云函数安全规则](https://docs.cloudbase.net/cloud-function/security-rules)、[云存储安全规则](https://docs.cloudbase.net/storage/security-rules)、[文档型数据库安全规则](https://docs.cloudbase.net/database/security-rules) |
| UpdatedAt    | String | 最后更新时间，ISO 8601格式                          |

#### 6.4 示例

**示例1：查询SQL型数据库表预定义权限**

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeResourcePermission
<公共请求参数>

{
    "EnvId": "test-envId",
    "ResourceType": "table",
    "Resource": "users"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "ResourceType": "table",
            "Resource": "users",
            "ResourceName": "用户表",
            "Permission": "READONLY",
            "UpdatedAt": "2025-08-21T20:56:22Z"
        },
        "RequestId": "d4e5f6a7-b8c9-0123-def0-234567890123"
    }
}
```

**示例2：查询云存储自定义安全规则**

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeResourcePermission
<公共请求参数>

{
    "EnvId": "test-envId",
    "ResourceType": "storage",
    "Resource": "my-bucket"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "ResourceType": "storage",
            "Resource": "my-bucket",
            "ResourceName": "我的存储桶",
            "Permission": "CUSTOM",
            "SecurityRule": "{\"read\": \"auth != null\", \"write\": \"auth.role == 'admin'\"}",
            "UpdatedAt": "2025-08-21T20:56:22Z"
        },
        "RequestId": "e5f6a7b8-c9d0-1234-ef01-345678901234"
    }
}
```

#### 6.5 错误码

| 错误码                                | 描述             |
| :------------------------------------ | :--------------- |
| AuthFailure                           | CAM签名/鉴权错误 |
| FailedOperation                       | 操作失败         |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期   |
| InternalError                         | 内部错误         |
| InvalidParameter                      | 参数错误         |
| InvalidParameterValue                 | 参数取值错误     |
| ResourceNotFound                      | 资源不存在       |
| ResourceNotFound.ResourceNotExist     | 指定的资源不存在 |

---

### 7. 创建角色（CreateRole）

#### 7.1 接口描述

创建自定义角色，用于用户权限管理。系统角色（外部用户、组织成员、管理员、匿名用户、所有用户）由系统内置，不可通过此接口创建。

#### 7.2 输入参数

| 参数名称     | 必选 | 类型                | 描述                                                                                                                                                                                            |
| :----------- | :--- | :------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action       | 是   | String              | 公共参数，本接口取值：`CreateRole`                                                                                                                                                            |
| Version      | 是   | String              | 公共参数，本接口取值：`2018-06-08`                                                                                                                                                            |
| Region       | 否   | String              | 公共参数，本接口不需要传递此参数                                                                                                                                                                |
| EnvId        | 是   | String              | 环境ID `<br>`示例值：`test-envId`                                                                                                                                                           |
| RoleName     | 是   | String              | 角色名称，用于用户、流程中选择显示。规则：1. 不能为空 2. 长度2-32字符 3. 只能包含中文、英文字母、数字和符号 `-_:@.` 4. 只能以字母或中文开头 5. 不能重复 `<br>`示例值：`测试角色1`         |
| RoleIdentity | 是   | String              | 角色标识，角色的唯一标识，新建后不可更改。规则：1. 角色标识不能为空 2. 只能包含英文字母、数字和符号 `_-:@.` 3. 角色标识不能重复 4. 角色标识不能为默认角色标识 `<br>`示例值：`test_role_1` |
| Description  | 否   | String              | 角色描述，最多255字符 `<br>`示例值：`这是一个测试角色`                                                                                                                                      |
| MemberUids.N | 否   | Array of String     | 角色成员用户ID列表，创建角色时同时添加成员。一次最多支持添加100个 `<br>`示例值：`["1001", "1002", "1003"]`                                                                                  |
| Policies.N   | 否   | Array of PolicyItem | 权限策略列表，创建角色时同时配置权限。一次最多支持添加50条，结构详见PolicyItem说明 `<br>`示例值：见下方PolicyItem结构                                                                         |

**PolicyItem 结构：**

| 参数名称      | 必选 | 类型   | 描述                                                                                                                                                                                     |
| :------------ | :--- | :----- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ResourceType  | 是   | String | 资源类型：`dataSource`-数据模型、`app`-应用、`flow`-流程、`companyWorkBench`-工作台、`gateway`-网关`<br>`示例值：`dataSource`                                                                                                                                    |
| Resource      | 是   | String | 资源标识。传资源唯一标识（如 `userModel`、`orderApp`、`approvalFlow`）`<br>`示例值：`userModel`                                                                                                            |
| ResourceName  | 否   | String | 资源名称，仅用于展示`<br>`示例值：`用户数据模型`                                                                                                                                           |
| Effect        | 是   | String | 权限效果：`allow`-允许、`deny`-拒绝`<br>`示例值：`allow`                                                                                                                         |
| RowPermission | 是   | String | 行权限级别。可选值：`READONLY`-读取全部数据，修改本人数据；`PRIVATE`-读取和修改本人数据；`ADMINWRITE`-读取全部数据，不可修改数据；`ADMINONLY`-无权限`<br>`示例值：`READONLY` |

#### 7.3 输出参数

| 参数名称  | 类型           | 描述                                        |
| :-------- | :------------- | :------------------------------------------ |
| Data      | CreateRoleResp | 创建角色返回结果                            |
| RequestId | String         | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**CreateRoleResp 结构：**

| 参数名称   | 类型                | 描述                                         |
| :--------- | :------------------ | :------------------------------------------- |
| RoleId     | String              | 角色ID，系统自动生成                         |
| MemberUids | Array of String     | 成功添加的用户ID列表（传入MemberUids时返回） |
| Policies.N | Array of PolicyItem | 成功创建的策略列表（传入Policies时返回）     |

#### 7.4 示例

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: CreateRole
<公共请求参数>

{
    "EnvId": "test-envId",
    "RoleName": "测试角色1",
    "RoleIdentity": "test_role_1",
    "Description": "这是一个测试角色，包含成员和权限配置",
    "MemberUids": [
        "1001",
        "1002"
    ],
    "Policies": [
        {
            "ResourceType": "dataSource",
            "Resource": "userModel",
            "ResourceName": "用户数据模型",
            "Effect": "allow",
            "RowPermission": "READONLY"
        },
        {
            "ResourceType": "app",
            "Resource": "orderApp",
            "ResourceName": "订单应用",
            "Effect": "allow",
            "RowPermission": "PRIVATE"
        },
        {
            "ResourceType": "flow",
            "Resource": "approvalFlow",
            "ResourceName": "审批流程",
            "Effect": "allow",
            "RowPermission": "ADMINWRITE"
        }
    ]
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "RoleId": "role-abc123def456",
            "MemberUids": [
                "1001",
                "1002"
            ],
            "Policies": [
                {
                    "PolicyId": "20272684739712122289",
                    "ResourceType": "dataSource",
                    "Resource": "userModel",
                    "ResourceName": "用户数据模型",
                    "Effect": "allow",
                    "RowPermission": "READONLY"
                },
                {
                    "PolicyId": "20272684740076672",
                    "ResourceType": "app",
                    "Resource": "orderApp",
                    "ResourceName": "订单应用",
                    "Effect": "allow",
                    "RowPermission": "PRIVATE"
                },
                {
                    "PolicyId": "20272684760047672",
                    "ResourceType": "flow",
                    "Resource": "approvalFlow",
                    "ResourceName": "审批流程",
                    "Effect": "allow",
                    "RowPermission": "ADMINWRITE"
                }
            ]
        },
        "RequestId": "af638232-4d1c-4e41-b959-ea3dbe5de0be"
    }
}
```

#### 7.5 错误码

| 错误码                                | 描述                                                 |
| :------------------------------------ | :--------------------------------------------------- |
| AuthFailure                           | CAM签名/鉴权错误                                     |
| FailedOperation                       | 操作失败                                             |
| FailedOperation.DuplicatedData        | 角色名称或角色标识已存在                             |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期                                       |
| InternalError                         | 内部错误                                             |
| InvalidParameter                      | 参数错误                                             |
| InvalidParameterValue                 | 参数取值错误                                         |
| ResourceNotFound                      | 资源不存在                                           |
| ResourceNotFound.UserNotExist         | 成员用户不存在（MemberUids中包含不存在的用户）       |
| ResourceNotFound.ResourceNotExist     | 权限策略中的资源不存在（Policies中包含不存在的资源） |

#### 7.6 接口说明

1. **原子性保证**：角色创建失败时，不会添加成员和权限；角色创建成功后，成员和权限的添加采用尽力而为机制
2. **成员和权限处理**：
   - 若MemberUids中部分用户不存在，只添加存在的用户
   - 若Policies中部分资源不存在，只添加有效的策略
3. **返回值说明**：
   - 创建成功返回角色ID
   - 传入MemberUids时返回成功添加的用户ID列表（MemberUids）
   - 传入Policies时返回成功创建的策略列表（Policies），包含策略ID和完整的策略信息
   - 若部分成员或策略添加失败，返回列表中只包含成功添加的数据

---

### 8. 查询角色列表（DescribeRoleList）

#### 8.1 接口描述

查询环境下的角色列表，包含系统角色和自定义角色。

#### 8.2 输入参数

| 参数名称 | 必选 | 类型    | 描述                                                                                                    |
| :------- | :--- | :------ | :------------------------------------------------------------------------------------------------------ |
| Action   | 是   | String  | 公共参数，本接口取值：`DescribeRoleList`                                                              |
| Version  | 是   | String  | 公共参数，本接口取值：`2018-06-08`                                                                    |
| Region   | 否   | String  | 公共参数，本接口不需要传递此参数                                                                        |
| EnvId    | 是   | String  | 环境ID `<br>`示例值：`test-envId`                                                                   |
| PageNo   | 否   | Integer | 页码，从1开始，默认为1 `<br>`示例值：`1`                                                            |
| PageSize | 否   | Integer | 每页数量，默认20，最大100 `<br>`示例值：`20`                                                        |
| RoleName | 否   | String  | 角色名称，支持模糊查询 `<br>`示例值：`测试`                                                         |
| RoleType | 否   | String  | 角色类型筛选：`system`-系统角色、`custom`-自定义角色。不传则返回所有角色 `<br>`示例值：`custom` |

#### 8.3 输出参数

| 参数名称  | 类型                 | 描述                                        |
| :-------- | :------------------- | :------------------------------------------ |
| Data      | DescribeRoleListResp | 查询角色列表返回结果                        |
| RequestId | String               | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**DescribeRoleListResp 结构：**

| 参数名称       | 类型              | 描述                                       |
| :------------- | :---------------- | :----------------------------------------- |
| Total          | Integer           | 角色总数（系统角色数 + 自定义角色数）      |
| SystemRoles    | Array of RoleInfo | 系统角色列表                               |
| CustomRoles    | Array of RoleInfo | 自定义角色列表                             |
| CustomTotal    | Integer           | 自定义角色总数                             |

**RoleInfo 结构：**

| 参数名称     | 类型                | 描述                                                 |
| :----------- | :------------------ | :--------------------------------------------------- |
| RoleId       | String              | 角色ID                                               |
| RoleName     | String              | 角色名称                                             |
| RoleIdentity | String              | 角色标识                                             |
| RoleType     | String              | 角色类型：`system`-系统角色、`custom`-自定义角色 |
| Description  | String              | 角色描述                                             |
| IsEditable   | Boolean             | 是否可编辑，系统角色不可编辑名称和标识               |
| IsDeletable  | Boolean             | 是否可删除，系统角色不可删除                         |
| UsageNote    | String              | 使用须知，如系统角色的使用提示信息                   |
| Members.N    | Array of MemberInfo | 角色成员列表                                         |
| Policies.N   | Array of PolicyItem | 角色权限策略列表                                     |
| CreatedAt    | String              | 创建时间，ISO 8601格式                               |
| UpdatedAt    | String              | 更新时间，ISO 8601格式                               |

**MemberInfo 结构：**

| 参数名称 | 类型   | 描述     |
| :------- | :----- | :------- |
| Uid      | String | 用户ID   |
| Name     | String | 用户名   |
| NickName | String | 用户昵称 |

**PolicyItem 结构：**

| 参数名称      | 类型   | 描述                                                                                                                                                         |
| :------------ | :----- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PolicyId      | String | 策略ID                                                                                                                                                       |
| ResourceType  | String | 资源类型：`dataSource`-数据模型、`app`-应用、`flow`-流程、`companyWorkBench`-工作台、`gateway`-网关                                                                                                                                 |
| Resource      | String | 资源标识。传资源唯一标识（如 `userModel`、`orderApp`、`approvalFlow`）                                                                                                         |
| ResourceName  | String | 资源名称，仅用于展示                                                                                                                                         |
| Effect        | String | 权限效果：`allow`-允许、`deny`-拒绝                                                                                                                      |
| RowPermission | String | 行权限级别。可选值：`READONLY`-读取全部数据，修改本人数据；`PRIVATE`-读取和修改本人数据；`ADMINWRITE`-读取全部数据，不可修改数据；`ADMINONLY`-无权限 |

#### 8.4 示例

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DescribeRoleList
<公共请求参数>

{
    "EnvId": "test-envId",
    "PageNo": 1,
    "PageSize": 20,
    "RoleType": "custom"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Total": 6,
            "CustomTotal": 1,
            "SystemRoles": [
                {
                    "RoleId": "role-system-external",
                    "RoleName": "外部用户",
                    "RoleIdentity": "externalUser",
                    "RoleType": "system",
                    "Description": "使用帐号密码或其他方式注册成为外部用户，非使用已登录的用户",
                    "IsEditable": false,
                    "IsDeletable": false,
                    "UsageNote": "C端应用下，仅对注册为外部用户的访问权限生效，如电商应用等",
                    "Members": [
                        {
                            "Uid": "1001",
                            "Name": "zhangsan",
                            "NickName": "张三"
                        },
                        {
                            "Uid": "1002",
                            "Name": "lisi",
                            "NickName": "李四"
                        },
                        {
                            "Uid": "1005",
                            "Name": "zhaoliu",
                            "NickName": "赵六"
                        }
                    ],
                    "Policies": [
                        {
                            "PolicyId": "20272684739712122289",
                            "ResourceType": "dataSource",
                            "Resource": "userModel",
                            "ResourceName": "用户数据模型",
                            "Effect": "allow",
                            "RowPermission": "PRIVATE"
                        }
                    ],
                    "CreatedAt": "2025-01-01T00:00:00Z",
                    "UpdatedAt": "2025-08-21T20:56:22Z"
                },
                {
                    "RoleId": "role-system-org",
                    "RoleName": "组织成员",
                    "RoleIdentity": "orgMember",
                    "RoleType": "system",
                    "Description": "适应企业内部组织架构的用户",
                    "IsEditable": false,
                    "IsDeletable": false,
                    "UsageNote": "适用内部管理系统，控制企业内容访问权限配置，如企业办公台等",
                    "Members": [
                        {
                            "Uid": "1003",
                            "Name": "wangwu",
                            "NickName": "王五"
                        },
                        {
                            "Uid": "1004",
                            "Name": "sunqi",
                            "NickName": "孙七"
                        }
                    ],
                    "Policies": [
                        {
                            "PolicyId": "20272684740076672",
                            "ResourceType": "app",
                            "Resource": "orderApp",
                            "ResourceName": "订单应用",
                            "Effect": "allow",
                            "RowPermission": "READONLY"
                        }
                    ],
                    "CreatedAt": "2025-01-01T00:00:00Z",
                    "UpdatedAt": "2025-08-21T20:56:22Z"
                },
                {
                    "RoleId": "role-system-admin",
                    "RoleName": "管理员",
                    "RoleIdentity": "admin",
                    "RoleType": "system",
                    "Description": "管理员拥有全部权限",
                    "IsEditable": false,
                    "IsDeletable": false,
                    "UsageNote": "管理员角色，拥有全部资源的全部权限，并支持读以及访问权限的管理，不建议关联太多人员，不建议授权太高",
                    "Members": [
                        {
                            "Uid": "1001",
                            "Name": "zhangsan",
                            "NickName": "张三"
                        }
                    ],
                    "Policies": [],
                    "CreatedAt": "2025-01-01T00:00:00Z",
                    "UpdatedAt": "2025-08-21T20:56:22Z"
                },
                {
                    "RoleId": "role-system-anonymous",
                    "RoleName": "匿名用户",
                    "RoleIdentity": "anonymousUser",
                    "RoleType": "system",
                    "Description": "使用匿名登录方式的用户",
                    "IsEditable": false,
                    "IsDeletable": false,
                    "UsageNote": "C端应用下，限制匿名登录用户的访问权限，如电商应用等",
                    "Members": [],
                    "Policies": [],
                    "CreatedAt": "2025-01-01T00:00:00Z",
                    "UpdatedAt": "2025-08-21T20:56:22Z"
                },
                {
                    "RoleId": "role-system-all",
                    "RoleName": "所有用户",
                    "RoleIdentity": "allUser",
                    "RoleType": "system",
                    "Description": "使用任意登录方式的所有用户，包含注册用户、匿名用户",
                    "IsEditable": false,
                    "IsDeletable": false,
                    "UsageNote": "C端应用下所有用户的关联角色",
                    "Members": [],
                    "Policies": [
                        {
                            "PolicyId": "20272684760047672",
                            "ResourceType": "companyWorkBench",
                            "Resource": "mainWorkBench",
                            "ResourceName": "主工作台",
                            "Effect": "allow",
                            "RowPermission": "ADMINWRITE"
                        }
                    ],
                    "CreatedAt": "2025-01-01T00:00:00Z",
                    "UpdatedAt": "2025-08-21T20:56:22Z"
                }
            ],
            "CustomRoles": [
                {
                    "RoleId": "role-abc123def456",
                    "RoleName": "测试角色1",
                    "RoleIdentity": "test_role_1",
                    "RoleType": "custom",
                    "Description": "324234",
                    "IsEditable": true,
                    "IsDeletable": true,
                    "UsageNote": "",
                    "Members": [
                        {
                            "Uid": "1001",
                            "Name": "zhangsan",
                            "NickName": "张三"
                        },
                        {
                            "Uid": "1002",
                            "Name": "lisi",
                            "NickName": "李四"
                        }
                    ],
                    "Policies": [
                        {
                            "PolicyId": "20272684739712122289",
                            "ResourceType": "dataSource",
                            "Resource": "userModel",
                            "ResourceName": "用户数据模型",
                            "Effect": "allow",
                            "RowPermission": "READONLY"
                        },
                        {
                            "PolicyId": "20272684760047672",
                            "ResourceType": "gateway",
                            "Resource": "apiGateway",
                            "ResourceName": "API网关",
                            "Effect": "allow",
                            "RowPermission": "ADMINWRITE"
                        }
                    ],
                    "CreatedAt": "2025-08-21T20:56:22Z",
                    "UpdatedAt": "2025-08-21T20:56:22Z"
                }
            ]
        },
        "RequestId": "eb985f06-ebb2-4d1f-a224-2f5bdc0c4eb4"
    }
}
```

#### 8.5 错误码

| 错误码                                | 描述             |
| :------------------------------------ | :--------------- |
| AuthFailure                           | CAM签名/鉴权错误 |
| FailedOperation                       | 操作失败         |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期   |
| InternalError                         | 内部错误         |
| ResourceNotFound                      | 资源不存在       |

---

### 9. 修改角色（ModifyRole）

#### 9.1 接口描述

修改自定义角色信息,包括角色基本信息、成员列表和权限策略。系统角色仅允许修改描述信息。支持增量修改成员和权限策略（新增、删除）。

#### 9.2 输入参数

| 参数名称           | 必选 | 类型                | 描述                                                                                                                                                                                                                   |
| :----------------- | :--- | :------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action             | 是   | String              | 公共参数，本接口取值：`ModifyRole`                                                                                                                                                                                   |
| Version            | 是   | String              | 公共参数，本接口取值：`2018-06-08`                                                                                                                                                                                   |
| Region             | 否   | String              | 公共参数，本接口不需要传递此参数                                                                                                                                                                                       |
| EnvId              | 是   | String              | 环境ID `<br>`示例值：`test-envId`                                                                                                                                                                                  |
| RoleId             | 是   | String              | 角色ID `<br>`示例值：`role-abc123def456`                                                                                                                                                                           |
| RoleName           | 否   | String              | 角色名称。不传或传空则不修改。规则：1. 长度2-32字符 2. 只能包含中文、英文字母、数字和符号 `-_:@.` 3. 只能以字母或中文开头 4. 不能重复。注意：角色标识（RoleIdentity）创建后不可修改 `<br>`示例值：`测试角色改名` |
| Description        | 否   | String              | 角色描述，最多255字符。不传不修改，传空字符则修改为空 `<br>`示例值：`更新后的角色描述`                                                                                                                             |
| AddMemberUids.N    | 否   | Array of String     | 新增角色成员用户ID列表。将指定用户添加到角色成员中。不传则不新增成员 `<br>`示例值：`["1001", "1003"]`                                                                                                              |
| RemoveMemberUids.N | 否   | Array of String     | 删除角色成员用户ID列表。将指定用户从角色成员中移除。不传则不删除成员 `<br>`示例值：`["1002"]`                                                                                                                      |
| AddPolicies.N      | 否   | Array of PolicyItem | 新增权限策略列表。将指定策略添加到角色权限中。不传则不新增权限 `<br>`示例值：见下方PolicyItem结构                                                                                                                   |
| RemovePolicyIds.N  | 否   | Array of String     | 删除权限策略ID列表。将指定策略从角色权限中移除。不传则不删除权限 `<br>`示例值：`["20272684739712122289"]`                                                                                                          |

**PolicyItem 结构：**

| 参数名称      | 必选 | 类型   | 描述                                                                                                                                                                                     |
| :------------ | :--- | :----- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ResourceType  | 是   | String | 资源类型：`dataSource`-数据模型、`app`-应用、`flow`-流程、`companyWorkBench`-工作台、`gateway`-网关`<br>`示例值：`dataSource`                                                                                                                                    |
| Resource      | 是   | String | 资源标识。传资源唯一标识（如 `userModel`、`orderApp`、`approvalFlow`）`<br>`示例值：`userModel`                                                                                                            |
| ResourceName  | 否   | String | 资源名称，仅用于展示`<br>`示例值：`用户数据模型`                                                                                                                                           |
| Effect        | 是   | String | 权限效果：`allow`-允许、`deny`-拒绝`<br>`示例值：`allow`                                                                                                                         |
| RowPermission | 是   | String | 行权限级别。可选值：`READONLY`-读取全部数据，修改本人数据；`PRIVATE`-读取和修改本人数据；`ADMINWRITE`-读取全部数据，不可修改数据；`ADMINONLY`-无权限`<br>`示例值：`READONLY` |

#### 9.3 输出参数

| 参数名称  | 类型           | 描述                                        |
| :-------- | :------------- | :------------------------------------------ |
| Data      | ModifyRoleResp | 修改角色返回结果                            |
| RequestId | String         | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**ModifyRoleResp 结构：**

| 参数名称          | 类型                | 描述                                             |
| :---------------- | :------------------ | :----------------------------------------------- |
| Success           | Boolean             | 是否修改成功                                     |
| AddedMemberUids   | Array of String     | 成功新增的用户ID列表（传入AddMemberUids时返回）  |
| RemovedMemberUids | Array of String     | 成功删除的用户ID列表（传入RemoveMemberUids时返回） |
| AddedPolicies.N   | Array of PolicyItem | 成功新增的策略列表（传入AddPolicies时返回）      |
| RemovedPolicyIds  | Array of String     | 成功删除的策略ID列表（传入RemovePolicyIds时返回）  |

#### 9.4 示例

**示例1：只修改角色基本信息**

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ModifyRole
<公共请求参数>

{
    "EnvId": "test-envId",
    "RoleId": "role-abc123def456",
    "RoleName": "测试角色改名",
    "Description": "更新后的角色描述"
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Success": true
        },
        "RequestId": "76c0ca0f-4cf2-4f89-80b9-cdbf9ab7dd77"
    }
}
```

**示例2：增量修改角色成员和权限**

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: ModifyRole
<公共请求参数>

{
    "EnvId": "test-envId",
    "RoleId": "role-abc123def456",
    "RoleName": "测试角色改名",
    "Description": "更新后的角色描述",
    "AddMemberUids": [
        "1003",
        "1004"
    ],
    "RemoveMemberUids": [
        "1002"
    ],
    "AddPolicies": [
        {
            "ResourceType": "flow",
            "Resource": "approvalFlow",
            "ResourceName": "审批流程",
            "Effect": "allow",
            "RowPermission": "ADMINWRITE"
        }
    ],
    "RemovePolicyIds": [
        "20272684740076672"
    ]
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "Success": true,
            "AddedMemberUids": [
                "1003",
                "1004"
            ],
            "RemovedMemberUids": [
                "1002"
            ],
            "AddedPolicies": [
                {
                    "PolicyId": "20272684760047672",
                    "ResourceType": "flow",
                    "Resource": "approvalFlow",
                    "ResourceName": "审批流程",
                    "Effect": "allow",
                    "RowPermission": "ADMINWRITE"
                }
            ],
            "RemovedPolicyIds": [
                "20272684740076672"
            ]
        },
        "RequestId": "76c0ca0f-4cf2-4f89-80b9-cdbf9ab7dd77"
    }
}
```

#### 9.5 错误码

| 错误码                                | 描述                         |
| :------------------------------------ | :--------------------------- |
| AuthFailure                           | CAM签名/鉴权错误             |
| FailedOperation                       | 操作失败                     |
| FailedOperation.DuplicatedData        | 角色名称已存在               |
| FailedOperation.FlexdbResourceOverdue | Flexdb资源过期               |
| InternalError                         | 内部错误                     |
| InvalidParameter                      | 参数错误                     |
| InvalidParameterValue                 | 参数取值错误                 |
| ResourceNotFound                      | 资源不存在                   |
| ResourceNotFound.RoleNotExist         | 角色不存在                   |
| ResourceNotFound.UserNotExist         | 成员用户不存在               |
| ResourceNotFound.ResourceNotExist     | 权限策略中的资源不存在       |
| UnsupportedOperation                  | 系统角色不允许修改名称和标识 |

#### 9.6 接口说明

1. **修改策略**：

   - 不传某个参数则不修改该项
   - 支持增量修改：可以同时新增和删除成员及权限
   - 成员管理：使用 AddMemberUids 新增成员，使用 RemoveMemberUids 删除成员
   - 权限管理：使用 AddPolicies 新增权限，使用 RemovePolicyIds 删除权限（需传入策略ID）
2. **部分成功处理**：

   - 若AddMemberUids中部分用户不存在，只添加存在的用户
   - 若RemoveMemberUids中部分用户不在角色中，只删除存在的用户
   - 若AddPolicies中部分资源不存在，只添加有效的策略
   - 若RemovePolicyIds中部分策略不存在，只删除存在的策略
   - 返回值中只包含成功操作的成员和策略
3. **系统角色限制**：

   - 系统角色只允许修改Description
   - 系统角色不允许修改RoleName、成员和权限

---

### 10. 删除角色（DeleteRoles）

#### 10.1 接口描述

批量删除自定义角色。系统角色不可删除。删除角色时将自动解除角色与用户的关联关系以及角色绑定的权限策略。

#### 10.2 输入参数

| 参数名称  | 必选 | 类型            | 描述                                                                        |
| :-------- | :--- | :-------------- | :-------------------------------------------------------------------------- |
| Action    | 是   | String          | 公共参数，本接口取值：`DeleteRoles`                                       |
| Version   | 是   | String          | 公共参数，本接口取值：`2018-06-08`                                        |
| Region    | 否   | String          | 公共参数，本接口不需要传递此参数                                            |
| EnvId     | 是   | String          | 环境ID `<br>`示例值：`test-envId`                                       |
| RoleIds.N | 是   | Array of String | 角色ID列表，一次最多支持删除100个 `<br>`示例值：`["role-abc123def456"]` |

#### 10.3 输出参数

| 参数名称  | 类型            | 描述                                        |
| :-------- | :-------------- | :------------------------------------------ |
| Data      | DeleteRolesResp | 删除角色返回结果                            |
| RequestId | String          | 唯一请求 ID，由服务端生成，每次请求都会返回 |

**DeleteRolesResp 结构：**

| 参数名称     | 类型    | 描述               |
| :----------- | :------ | :----------------- |
| SuccessCount | Integer | 成功删除的角色数量 |
| FailedCount  | Integer | 删除失败的角色数量 |

#### 10.4 示例

**输入示例：**

```http
POST / HTTP/1.1
Host: tcb.tencentcloudapi.com
Content-Type: application/json
X-TC-Action: DeleteRoles
<公共请求参数>

{
    "EnvId": "test-envId",
    "RoleIds": [
        "role-abc123def456"
    ]
}
```

**输出示例：**

```json
{
    "Response": {
        "Data": {
            "SuccessCount": 1,
            "FailedCount": 0
        },
        "RequestId": "563b4e8e-7898-401d-95b1-c86bbaecc6b3"
    }
}
```

#### 10.5 错误码

| 错误码               | 描述               |
| :------------------- | :----------------- |
| AuthFailure          | CAM签名/鉴权错误   |
| FailedOperation      | 操作失败           |
| InternalError        | 内部错误           |
| ResourceNotFound     | 资源不存在         |
| UnsupportedOperation | 系统角色不允许删除 |

---

## 三、数据结构汇总

### 用户相关

| 数据结构             | 描述                                                                                           |
| :------------------- | :--------------------------------------------------------------------------------------------- |
| CreateUserResp       | 创建用户返回结构，包含 Uid                                                                     |
| DescribeUserListResp | 查询用户列表返回结构，包含 Total、UserList                                                     |
| UserInfo             | 用户信息结构，包含 Uid、Name、NickName、Phone、Email、AvatarUrl、UserStatus、Type、Description |
| ModifyUserResp       | 修改用户返回结构，包含 Success                                                                 |
| DeleteUsersResp      | 删除用户返回结构，包含 SuccessCount、FailedCount                                               |

### 角色相关

| 数据结构             | 描述                                                                                                                                                  |
| :------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| CreateRoleResp       | 创建角色返回结构，包含 RoleId、MemberUids、Policies                                                                                                   |
| ModifyRoleResp       | 修改角色返回结构，包含 Success、MemberUids、Policies（传入MemberUids或Policies时返回）                                                                |
| DeleteRolesResp      | 删除角色返回结构，包含 SuccessCount、FailedCount                                                                                                      |
| DescribeRoleListResp | 查询角色列表返回结构，包含 Total、CustomTotal、SystemRoles、CustomRoles                                                                                                            |
| RoleInfo             | 角色信息结构，包含 RoleId、RoleName、RoleIdentity、RoleType、Description、IsEditable、IsDeletable、UsageNote、Members、Policies、CreatedAt、UpdatedAt |

### 权限策略相关

| 数据结构                 | 描述                                                                                                                                      |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| MemberInfo               | 角色成员信息结构，包含 Uid、Name、NickName                                                                                                |
| PolicyItem               | 权限策略输入结构，包含 ResourceType、Resource、ResourceName、Effect、RowPermission                                                        |
| PolicyInfo               | 权限策略信息结构，包含 PolicyId、ResourceType、Resource、ResourceName、Effect、RowPermission、ResourcePermissionUrl、CreatedAt、UpdatedAt |
| RoleMemberInfo           | 角色成员信息结构，包含 Uid、Name、NickName、PrimaryDepartment、SecondaryDepartments、Phone、Email、AvatarUrl、JoinedAt                    |
| UserRoleInfo             | 用户角色信息结构，包含 RoleId、RoleName、RoleIdentity、RoleType、JoinedAt                                                                 |
| DescribeRoleMembersResp  | 查询角色成员返回结构，包含 Total、MemberList                                                                                              |
| DescribeUserRolesResp    | 查询用户角色返回结构，包含 Total、RoleList                                                                                                |
| DescribeRolePoliciesResp | 查询权限策略返回结构，包含 Total、PolicyList                                                                                              |

### 基础权限相关

| 数据结构                       | 描述                                                                                                 |
| :----------------------------- | :--------------------------------------------------------------------------------------------------- |
| ModifyResourcePermissionResp   | 修改资源权限返回结构，包含 Success                                                                   |
| DescribeResourcePermissionResp | 查询资源权限返回结构，包含 ResourceType、Resource、ResourceName、Permission、SecurityRule、UpdatedAt |

---

## 四、接口总览

| 序号 | 模块         | 接口名称               | Action                     | 描述                                   |
| :--- | :----------- | :--------------------- | :------------------------- | :------------------------------------- |
| 1    | 用户管理     | 创建TCB用户            | CreateUser                 | 创建tcb用户                            |
| 2    | 用户管理     | 查询TCB用户列表        | DescribeUserList           | 查询tcb用户列表                        |
| 3    | 用户管理     | 更新TCB用户            | ModifyUser                 | 修改用户信息                           |
| 4    | 用户管理     | 删除TCB用户            | DeleteUsers                | 批量删除tcb用户                        |
| 5    | 权限管理     | 修改资源基础权限       | ModifyResourcePermission   | 修改云函数、云存储、数据库表的基础权限 |
| 6    | 权限管理     | 查询资源基础权限       | DescribeResourcePermission | 查询云函数、云存储、数据库表的基础权限 |
| 7    | 权限管理     | 创建角色               | CreateRole                 | 创建自定义角色                         |
| 8    | 权限管理     | 查询角色列表           | DescribeRoleList           | 查询系统角色和自定义角色               |
| 9    | 权限管理     | 修改角色               | ModifyRole                 | 修改角色名称、描述、成员和权限         |
| 10   | 权限管理     | 删除角色               | DeleteRoles                | 批量删除自定义角色                     |
| 11   | 登录认证管理 | 添加第三方认证源       | AddProvider                | 添加 OAuth、SAML、OIDC 等身份认证源    |
| 12   | 登录认证管理 | 修改第三方认证源       | ModifyProvider             | 修改认证源信息                         |
| 13   | 登录认证管理 | 获取三方认证源列表     | GetProviders               | 获取环境下所有认证源                   |
| 14   | 登录认证管理 | 查询应用客户端详情     | DescribeClient             | 查询单个客户端详情                     |
| 15   | 登录认证管理 | 修改应用客户端         | ModifyClient               | 修改应用信息                           |
| 16   | 登录认证管理 | 创建 API Key           | CreateApiKey               | 创建云开发平台的 API Key               |
| 17   | 登录认证管理 | 查询 API Key 列表      | DescribeApiKeys            | 查询 API Key 列表                      |
| 18   | 登录认证管理 | 删除 API Key           | DeleteApiKey               | 删除指定 API Key                       |
| 19   | 登录认证管理 | 自定义登录密钥生成     | CreateCustomLoginKey       | 创建自定义登录密钥                     |


---

## 五、登录认证管理


## 目录

- [一、第三方认证源管理](#一第三方认证源管理)
- [二、应用客户端管理](#二应用客户端管理)
- [三、API Key 管理](#三api-key-管理)
- [四、自定义登录](#四自定义登录)
- [五、数据结构](#五数据结构)
- [六、开发者资源](#六开发者资源)

---

## 一、第三方认证源管理

### 1.1 添加第三方认证源 (AddProvider)

添加 OAuth、SAML、OIDC 等身份认证源。限制：一个环境最大可允许加入 20 个认证源。

**核心参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |
| Name | 是 | LocalizedMessage | 身份源显示名称，支持多语言 |
| ProviderType | 是 | String | 协议类型：OAUTH/OIDC/SAML/WX_MICRO_APP/WX_MP/WX_OPEN |
| Id | 否 | String | 身份源唯一标识符（2~32位小写字母和数字） |
| Config | 否 | ProviderConfig | 认证配置（ClientId、ClientSecret等） |

**示例：添加谷歌认证源**

```json
{
  "EnvId": "lowcode-xxx",
  "Id": "google",
  "Name": {
    "Message": "Google",
    "Localized": [{"Locale": "zh", "Message": "谷歌"}]
  },
  "ProviderType": "OIDC",
  "Config": {
    "Issuer": "http://accounts.google.com",
    "ResponseType": "id_token"
  }
}
```

---

### 1.2 修改第三方认证源 (ModifyProvider)

修改认证源信息。

**核心参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |
| Id | 是 | String | 身份源唯一标识符 |
| Name | 否 | LocalizedMessage | 身份源显示名称 |
| Config | 否 | ProviderConfig | 认证配置 |
| On | 否 | String | 启用状态：TRUE/FALSE |
| EmailConfig | 否 | EmailProviderConfig | 邮箱配置 |

**示例1：修改谷歌认证源**

```json
{
  "EnvId": "lowcode-xxx",
  "Id": "google",
  "Name": {"Message": "Google"},
  "ProviderType": "OIDC",
  "Config": {
    "Issuer": "http://accounts.google.com"
  }
}
```

**示例2：修改邮箱认证源**

```json
{
  "EnvId": "tcb-env-01",
  "Id": "email",
  "EmailConfig": {
    "On": "FALSE",
    "SmtpConfig": {
      "SenderAddress": "123@qq.com",
      "ServerHost": "smtp.qq.com",
      "ServerPort": 465,
      "SecurityMode": "SSL"
    }
  }
}
```

---

### 1.3 获取三方认证源列表 (GetProviders)

获取环境下所有认证源。

**输入参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |

**输出参数**

| 参数 | 类型 | 描述 |
|------|------|------|
| Total | Integer | 列表总数 |
| Data | Array of Provider | 认证源列表 |

---

## 二、应用客户端管理

### 2.1 查询应用客户端详情 (DescribeClient)

查询单个客户端详情。

**输入参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |
| Id | 是 | String | 客户端ID |

**输出参数**

| 参数 | 类型 | 描述 |
|------|------|------|
| Id | String | 客户端ID |
| RefreshTokenExpiresIn | Integer | Refresh Token 有效期（秒），默认30天 |
| AccessTokenExpiresIn | Integer | Access Token 有效期（秒），默认2小时 |
| MaxDevice | Integer | 最大会话数，默认1 |
| CreatedAt | String | 创建时间 |
| UpdatedAt | String | 更新时间 |

---

### 2.2 修改应用客户端 (ModifyClient)

修改应用信息。

**核心参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |
| Id | 是 | String | 客户端ID |
| RefreshTokenExpiresIn | 否 | Integer | Refresh Token 有效期（秒） |
| AccessTokenExpiresIn | 否 | Integer | Access Token 有效期（秒） |
| MaxDevice | 否 | Integer | 最大会话数 |
| Status | 否 | String | 启用状态：ACTIVE/BLOCKED |

---

## 三、API Key 管理

### 3.1 创建 API Key (CreateApiKey)

创建云开发平台的 API Key。

**输入参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |
| KeyName | 是 | String | 密钥名称 |
| ExpireIn | 否 | Integer | 有效期（秒），0表示永不过期 |
| KeyType | 否 | String | 密钥类型：api_key/publish_key |

**输出参数**

| 参数 | 类型 | 描述 |
|------|------|------|
| KeyId | String | 密钥ID |
| ApiKey | String | 密钥值（仅创建时返回） |
| ExpireAt | String | 过期时间 |

---

### 3.2 查询 API Key 列表 (DescribeApiKeys)

查询 API Key 列表。

**输入参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |
| PageNumber | 否 | Integer | 页码，从1开始 |
| PageSize | 否 | Integer | 每页数量 |
| KeyType | 否 | String | 密钥类型过滤 |

---

### 3.3 删除 API Key (DeleteApiKey)

删除指定 API Key。

**输入参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |
| KeyId | 是 | String | 密钥ID |

---

## 四、自定义登录

### 4.1 自定义登录密钥生成 (CreateCustomLoginKey)

创建自定义登录密钥。返回的密钥信息需保存为 JSON 文件：

```json
{
  "private_key_id": "KeyID",
  "private_key": "PrivateKey",
  "env_id": "EnvId"
}
```

**输入参数**

| 参数 | 必选 | 类型 | 描述 |
|------|------|------|------|
| EnvId | 是 | String | 环境ID |

**输出参数**

| 参数 | 类型 | 描述 |
|------|------|------|
| PrivateKey | String | 自定义签名私钥 |
| KeyID | String | 私钥ID |

---

## 五、数据结构

### LocalizedMessage

多语言文本配置

| 字段 | 类型 | 描述 |
|------|------|------|
| Message | String | 默认文本 |
| Localized | Array | 多语言配置 [{Message, Locale}] |

---

### ProviderConfig

认证源配置

| 字段 | 类型 | 描述 |
|------|------|------|
| Issuer | String | OIDC Issuer URL |
| ClientId | String | 客户端ID |
| ClientSecret | String | 客户端密钥 |
| RedirectUri | String | 回调地址 |
| Scope | String | 权限范围 |
| AuthorizationEndpoint | String | 授权端点 |
| TokenEndpoint | String | Token端点 |
| UserinfoEndpoint | String | 用户信息端点 |

---

### EmailProviderConfig

邮箱登录配置

| 字段 | 类型 | 描述 |
|------|------|------|
| On | String | 是否使用默认代发：TRUE/FALSE |
| SmtpConfig | EmailSmtpConfig | SMTP配置 |

**EmailSmtpConfig 结构**

| 字段 | 类型 | 描述 |
|------|------|------|
| SenderAddress | String | 发件人邮箱 |
| ServerHost | String | SMTP服务器地址 |
| ServerPort | Integer | 端口（465/587/25） |
| AccountUsername | String | 登录账号 |
| AccountPassword | String | 登录密码/授权码 |
| SecurityMode | String | 加密模式：AUTO/SSL/STARTSSL/NO_SSL |

---

### Provider

第三方认证源完整信息

| 字段 | 类型 | 描述 |
|------|------|------|
| Id | String | 身份源ID |
| Name | LocalizedMessage | 显示名称 |
| ProviderType | String | 协议类型 |
| Config | ProviderConfig | 认证配置 |
| On | String | 启用状态 |
| AutoSignUpWithProviderUser | String | 自动注册：TRUE/FALSE/UNSPECIFIED |
| TransparentMode | String | 透传模式 |
| EmailConfig | EmailProviderConfig | 邮箱配置 |

---

### ApiKeyToken

API Key 信息

| 字段 | 类型 | 描述 |
|------|------|------|
| KeyId | String | 密钥ID |
| Name | String | 密钥名称 |
| ApiKey | String | 密钥值（仅创建时返回） |
| ExpireAt | String | 过期时间 |
| CreateAt | String | 创建时间 |

---

## 常见错误码

| 错误码 | 描述 |
|--------|------|
| AuthFailure | CAM签名/鉴权错误 |
| FailedOperation | 操作失败 |
| InternalError | 内部错误 |
| InvalidParameter | 参数错误 |
| InvalidParameterValue | 参数取值错误 |
| ResourceNotFound | 资源不存在 |
| UnauthorizedOperation | 未授权操作 |
| LimitExceeded | 超过配额限制 |
| ResourceInUse | 资源被占用 |
