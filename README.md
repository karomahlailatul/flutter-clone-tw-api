# flutter-clone-tw-api
Auth:
POST /api/register - Register new user
POST /api/login - Login user

Posts:
POST /api/posts - Create new post
GET /api/posts - Get all posts
GET /api/posts/:postId/replies - Get post replies
POST /api/posts/:postId/like - Like/unlike post

Users:
POST /api/users/:userId/follow - Follow/unfollow user
GET /api/users/:userId - Get user profile
GET /api/feed - Get personalized feed