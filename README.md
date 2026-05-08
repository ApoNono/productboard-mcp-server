# Productboard MCP Server

> **Internal fork** of [miguelarios/productboard-mcp-server](https://github.com/miguelarios/productboard-mcp-server) with five pending bug fixes applied: cache returning `undefined` on miss (broke every tool call with default config), MCP stdio protocol pollution from pretty logs, bearer-auth logger hygiene, notes-API filtering/search using the wrong Productboard parameter names and endpoint, and product-hierarchy assembling the tree client-side instead of calling a non-existent `/products/hierarchy` endpoint. Pinned tag: `v1.0.3-fork`. Upstream PRs are open and this fork will track upstream once they merge.

A **comprehensive** Model Context Protocol (MCP) server that provides seamless integration with the Productboard API. This server enables AI assistants and other MCP clients to interact with Productboard through **49 specialized tools** covering all major Productboard functionalities.

## 🚀 Quick Start (Bearer Token - Recommended)

The fastest way to get started with full access to all tools:

```bash
# 1. Clone the repository
git clone https://github.com/miguelarios/productboard-mcp-server.git
cd productboard-mcp-server

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env

# 4. Add your Productboard API key to .env:
PRODUCTBOARD_AUTH_TYPE=bearer
PRODUCTBOARD_API_TOKEN=your_api_key_from_productboard

# 5. Build and run
npm run build
npm start
```

**That's it!** Bearer tokens provide immediate access to all 49 tools without complex permission setup.

> 📍 **Get your API key:** Visit `https://your-subdomain.productboard.com/settings/api-keys` in your Productboard workspace.

## ✨ Key Features

### 🔐 **Simplified Authentication**
- **🎯 Bearer Token Fast Path** - API keys provide instant access to all tools (recommended)
- **🔧 OAuth2 Support** - Role-based scoped access for team collaboration
- **🔄 Automatic Token Management** - Handles validation and refresh automatically

### 🛠️ **Complete Tool Coverage**

**Total: 49 MCP Tools** covering 100% of major Productboard functionality:

#### 🎯 Feature Management (6 tools)
- Create, read, update, delete features
- Bulk operations and advanced filtering
- Feature lifecycle management

#### 📦 Product Management (3 tools)  
- Product hierarchy navigation
- Component and product creation
- Organizational structure management

#### 📝 Customer Feedback (4 tools)
- Note creation and management
- Feature-feedback linking
- Bulk note operations

#### 👥 User & Company Management (3 tools)
- User directory and profiles
- Company information access
- Workspace member management

#### 🎯 Objectives & Key Results (7 tools)
- OKR creation and tracking
- Feature-objective linking
- Strategic goal management

#### 🚀 Release Management (8 tools)
- Release planning and tracking
- Feature assignment to releases
- Timeline and status management

#### 🔗 Webhooks & Integrations (5 tools)
- Webhook configuration
- Third-party integrations
- Real-time event management

#### 🔍 Search & Analytics (4 tools)
- Global search capabilities
- Advanced filtering and reporting
- Performance metrics and insights

#### ⚡ Bulk Operations (5 tools)
- Mass data operations
- Efficient batch processing
- Time-saving automation

#### 📊 Custom Fields & Export (10 tools)
- Custom field management
- Data export capabilities
- Configuration and setup tools

## 🏗️ Architecture Highlights

- **Bearer Token Fast Path** - API keys bypass permission discovery for immediate full access
- **OAuth2 Scope System** - Granular permissions based on Productboard roles
- **Permission-Based Tool Registration** - Only relevant tools are loaded
- **Comprehensive Error Handling** - Robust API interaction with retry logic
- **Rate Limiting & Caching** - Production-ready performance optimizations

## 📖 Setup Options

### Option 1: Bearer Token (Recommended)
Perfect for personal use or when you need immediate access to all tools:

1. Get your API key from Productboard settings
2. Set `PRODUCTBOARD_AUTH_TYPE=bearer` in `.env`
3. Add your `PRODUCTBOARD_API_TOKEN`
4. Run the server - all 49 tools available instantly!

### Option 2: OAuth2 (Team Collaboration)
Ideal for team environments with role-based access:

1. Create OAuth2 application in Productboard
2. Configure scopes based on user roles (contributor/maker/admin)
3. Run OAuth2 setup process
4. Tools are registered based on granted scopes

📚 **Detailed Setup Guide:** See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for comprehensive instructions.

## 🔧 Configuration

### Environment Variables

```bash
# Authentication
PRODUCTBOARD_AUTH_TYPE=bearer              # or 'oauth2'
PRODUCTBOARD_API_TOKEN=your_api_key        # For Bearer token auth
PRODUCTBOARD_API_BASE_URL=https://api.productboard.com

# OAuth2 (if using OAuth2)
PRODUCTBOARD_OAUTH_CLIENT_ID=your_client_id
PRODUCTBOARD_OAUTH_CLIENT_SECRET=your_client_secret
PRODUCTBOARD_OAUTH_PRESET=admin            # contributor, maker, admin

# Server Configuration
MCP_SERVER_PORT=3000
LOG_LEVEL=info
CACHE_ENABLED=true
```

### Role-Based Access (OAuth2)

- **Contributor** (~5 tools): Note creation, user info
- **Maker** (~15 tools): Notes, users, releases, feedback forms  
- **Admin** (~49 tools): Full system access including OKRs, analytics, integrations

## 🖥️ MCP Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "productboard": {
      "command": "node",
      "args": ["/full/path/to/productboard-mcp-server/dist/index.js"],
      "env": {
        "PRODUCTBOARD_AUTH_TYPE": "bearer",
        "PRODUCTBOARD_API_TOKEN": "your_api_key_here"
      }
    }
  }
}
```

## 🧪 Development

```bash
# Development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## 📋 Available MCP Tools

<details>
<summary>Click to view all 49 tools</summary>

### Features (6)
- `pb_feature_create` - Create new features
- `pb_feature_list` - List and filter features
- `pb_feature_get` - Get feature details
- `pb_feature_update` - Update feature properties
- `pb_feature_delete` - Delete/archive features
- `pb_feature_bulk_update` - Bulk update operations

### Products (3)
- `pb_product_create` - Create products/components
- `pb_product_list` - List products and components
- `pb_product_hierarchy` - Get product structure

### Notes (4)
- `pb_note_create` - Create customer feedback
- `pb_note_list` - List notes with filtering
- `pb_note_attach` - Link notes to features
- `pb_note_bulk_create` - Bulk note creation

### Users & Companies (3)
- `pb_user_current` - Current user information
- `pb_user_list` - List workspace users
- `pb_company_list` - List companies

### Objectives & Key Results (7)
- `pb_objective_create` - Create objectives
- `pb_objective_list` - List objectives
- `pb_objective_update` - Update objectives
- `pb_objective_link_feature` - Link features to objectives
- `pb_keyresult_create` - Create key results
- `pb_keyresult_list` - List key results
- `pb_keyresult_update` - Update key results

### Releases (8)
- `pb_release_create` - Create releases
- `pb_release_list` - List releases
- `pb_release_update` - Update release details
- `pb_release_feature_add` - Add features to releases
- `pb_release_feature_remove` - Remove features from releases
- `pb_release_status_update` - Update release status
- `pb_release_timeline` - Get release timeline
- `pb_release_bulk_update` - Bulk release operations

### Webhooks (5)
- `pb_webhook_create` - Create webhooks
- `pb_webhook_list` - List configured webhooks
- `pb_webhook_update` - Update webhook settings
- `pb_webhook_delete` - Delete webhooks
- `pb_webhook_test` - Test webhook functionality

### Search & Analytics (4)
- `pb_search_global` - Global search across Productboard
- `pb_search_features` - Search features specifically
- `pb_search_notes` - Search customer feedback
- `pb_analytics_features` - Feature usage analytics

### Custom Fields (4)
- `pb_customfield_create` - Create custom fields
- `pb_customfield_list` - List available custom fields
- `pb_customfield_set_value` - Set custom field values
- `pb_export_data` - Export Productboard data

### Bulk Operations (5)
- `pb_feature_bulk_create` - Bulk create features
- `pb_feature_bulk_delete` - Bulk delete features
- `pb_note_bulk_attach` - Bulk attach notes to features
- `pb_integration_jira_sync` - Sync with Jira
- `pb_integration_export_jira` - Export to Jira

</details>

## 🚨 Important Notes

- **Bearer tokens provide unrestricted access** - Use them for personal/admin scenarios
- **OAuth2 provides scoped access** - Use for team environments with role restrictions
- **All credentials are stored securely** - Never commit `.env` files to version control
- **Rate limiting is built-in** - Respects Productboard API limits automatically

## 🛟 Troubleshooting

### Common Issues

**❌ "Permission denied" errors with Bearer token**
- Ensure your API key is valid and from an admin user
- Check that `PRODUCTBOARD_AUTH_TYPE=bearer` is set correctly

**❌ "Tools not loading" with OAuth2**
- Verify your OAuth2 scopes match your Productboard role
- Check that authorization was completed successfully
- Review logs for specific permission errors

**❌ "Connection failed"**
- Verify `PRODUCTBOARD_API_BASE_URL` is correct
- Check network connectivity to api.productboard.com
- Ensure API key/tokens haven't expired

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

This MCP server provides comprehensive Productboard integration with both simple Bearer token authentication and advanced OAuth2 scope-based access control. The Bearer token fast path ensures immediate access to all functionality while OAuth2 enables fine-grained team permissions.

---

*Built with ❤️ using the Model Context Protocol*