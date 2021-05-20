const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//user registration
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const userCheckQuery = `SELECT * FROM user WHERE username='${username}';`;
  const isUserExist = await db.get(userCheckQuery);
  if (isUserExist === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `INSERT INTO user (name,username,password,gender) VALUES(
'${name}',
'${username}',
'${hashedPassword}',
'${gender}'
);`;
      await db.run(addUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// login user
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const userCheckQuery = `SELECT * FROM user WHERE username='${username}';`;
  const isUserExist = await db.get(userCheckQuery);
  if (isUserExist === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, isUserExist.password);
    if (checkPassword) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "leela");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//authenticate jwt
const AuthenticateJWT = (request, response, next) => {
  const authHead = request.headers["authorization"];
  let jwtToken;
  if (authHead === undefined) {
    console.log(authHead);
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHead.split(" ")[1];
    if (jwtToken === undefined) {
      response.status(401);
      response.send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "leela", async (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      });
    }
  }
};

//
app.get("/user/tweets/feed/", AuthenticateJWT, async (request, response) => {
  const getFollowingUidQuery = `SELECT *
   FROM user join follower ON user.user_id=follower.follower_user_id
   WHERE user.username LIKE "${request.username}" ;`;

  const followingUidData = await db.all(getFollowingUidQuery);
  let followingIds = followingUidData.map(
    (eachItem) => eachItem.following_user_id
  );

  const followingUserNames = `SELECT user.username,tweet.tweet,tweet.date_time AS dateTime
  FROM user JOIN tweet ON user.user_id=tweet.user_id WHERE user.user_id
  IN (${followingIds.join(",")}) ORDER BY tweet.date_time desc
   LIMIT 4;`;

  const tweetData = await db.all(followingUserNames);

  response.send(tweetData);
});

//
app.get("/user/following/", AuthenticateJWT, async (request, response) => {
  const getFollowingUidQuery = `SELECT *
   FROM user join follower ON user.user_id=follower.follower_user_id
   WHERE user.username LIKE "${request.username}" ;`;

  const followingUidData = await db.all(getFollowingUidQuery);

  let followingIds = followingUidData.map(
    (eachItem) => eachItem.following_user_id
  );

  const followingUserNames = `SELECT DISTINCT name FROM user WHERE user_id
  IN (${followingIds.join(",")});`;

  const followerNamesData = await db.all(followingUserNames);

  response.send(followerNamesData);
});

//get followers of user
app.get("/user/followers/", AuthenticateJWT, async (request, response) => {
  const getUidQuery = `SELECT user_id
   FROM user WHERE username LIKE "${request.username}" ;`;

  const uidData = await db.all(getUidQuery);
  let userId = uidData.map((item) => item.user_id);

  const followersUidQuery = `SELECT follower_user_id FROM follower WHERE following_user_id=${userId};`;
  const followersUidData = await db.all(followersUidQuery);
  let followerIds = followersUidData.map(
    (eachItem) => eachItem.follower_user_id
  );

  const followerUserNames = `SELECT DISTINCT name
  FROM user WHERE user_id IN (${followerIds.join(",")});`;

  const followerNamesData = await db.all(followerUserNames);

  response.send(followerNamesData);
});

//api 6 get tweet based on tweetId
app.get("/tweets/:tweetId/", AuthenticateJWT, async (request, response) => {
  let { tweetId } = request.params;
  const getFollowingUidQuery = `SELECT *
   FROM user join follower ON user.user_id=follower.follower_user_id
   WHERE user.username LIKE "${request.username}" ;`;

  const followingUidData = await db.all(getFollowingUidQuery);
  let followingIds = followingUidData.map(
    (eachItem) => eachItem.following_user_id
  );
  const getFollowingUsrIdQuery = `SELECT user_id FROM tweet WHERE tweet_id=${parseInt(
    tweetId
  )};`;
  let userDate = await db.get(getFollowingUsrIdQuery);

  let isFInd = followingIds.find((item) => {
    if (item === userDate.user_id) {
      return true;
    }
  });

  if (isFInd !== undefined) {
    const getTweetQuery = `SELECT tweet.tweet,COUNT(DISTINCT like.like_id) AS likes,COUNT(DISTINCT reply.reply) AS replies,tweet.date_time AS dateTime
      FROM tweet JOIN reply ON tweet.user_id=reply.user_id
     JOIN like ON tweet.user_id=like.user_id WHERE tweet.user_id=${isFInd};`;
    let tweetsDate = await db.get(getTweetQuery);

    response.send(tweetsDate);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//api 7 get likes of /tweets/:tweetId/likes/
app.get(
  "/tweets/:tweetId/likes/",
  AuthenticateJWT,
  async (request, response) => {
    let { tweetId } = request.params;
    const getFollowingUidQuery = `SELECT *
   FROM user join follower ON user.user_id=follower.follower_user_id
   WHERE user.username LIKE "${request.username}" ;`;

    const followingUidData = await db.all(getFollowingUidQuery);
    let followingIds = followingUidData.map(
      (eachItem) => eachItem.following_user_id
    );
    const getFollowingUsrIdQuery = `SELECT user_id FROM tweet WHERE tweet_id=${parseInt(
      tweetId
    )};`;
    let userDate = await db.get(getFollowingUsrIdQuery);

    let isFInd = followingIds.find((item) => {
      if (item === userDate.user_id) {
        return true;
      }
    });

    if (isFInd !== undefined) {
      const getUidOfTweetIdLikedUsers = `SELECT user.username AS likes FROM tweet join like ON tweet.tweet_id=like.tweet_id
     JOIN user ON user.user_id=like.user_id WHERE tweet.tweet_id = ${parseInt(
       tweetId
     )};`;
      let uidOfTweetIdLikers = await db.all(getUidOfTweetIdLikedUsers);
      response.send({ likes: uidOfTweetIdLikers.map((items) => items.likes) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//api 8 get all replies /tweets/:tweetId/replies/
app.get(
  "/tweets/:tweetId/replies/",
  AuthenticateJWT,
  async (request, response) => {
    let { tweetId } = request.params;
    const getFollowingUidQuery = `SELECT *
   FROM user join follower ON user.user_id=follower.follower_user_id
   WHERE user.username LIKE "${request.username}" ;`;

    const followingUidData = await db.all(getFollowingUidQuery);
    let followingIds = followingUidData.map(
      (eachItem) => eachItem.following_user_id
    );
    const getFollowingUsrIdQuery = `SELECT user_id FROM tweet WHERE tweet_id=${parseInt(
      tweetId
    )};`;
    let userDate = await db.get(getFollowingUsrIdQuery);

    let isFInd = followingIds.find((item) => {
      if (item === userDate.user_id) {
        return true;
      }
    });

    if (isFInd !== undefined) {
      const getUidOfTweetIdLikedUsers = `SELECT user.name ,reply.reply FROM tweet JOIN reply ON tweet.tweet_id=reply.tweet_id
      JOIN user ON user.user_id=reply.user_id WHERE tweet.tweet_id = ${parseInt(
        tweetId
      )};`;
      let uidOfTweetIdLikers = await db.all(getUidOfTweetIdLikedUsers);
      response.send({ replies: uidOfTweetIdLikers.map((items) => items) });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//api 9 get all tweets of user
app.get("/user/tweets/", AuthenticateJWT, async (request, response) => {
  const getUidQuery = `SELECT user_id
   FROM user WHERE username LIKE "${request.username}" ;`;

  const uidData = await db.all(getUidQuery);
  let userId = uidData.map((item) => item.user_id);

  const getAllTweetsOfUserQuery = `SELECT tweet.tweet,COUNT(DISTINCT like.like_id) AS likes,COUNT(DISTINCT reply.reply_id) AS replies,
 tweet.date_time AS dateTime FROM tweet JOIN like ON tweet.tweet_id=like.tweet_id JOIN
 reply ON tweet.tweet_id=reply.tweet_id WHERE tweet.user_id=${userId} GROUP BY tweet.tweet_id;`;
  let allTweetsOfUserData = await db.all(getAllTweetsOfUserQuery);
  response.send(allTweetsOfUserData);
});

//api 10 create a tweet in the tweet table /user/tweets/
app.post("/user/tweets/", AuthenticateJWT, async (request, response) => {
  let { tweet } = request.body;
  const getUidOfUser = `SELECT user_id FROM user WHERE username='${request.username}';`;
  let uid = await db.get(getUidOfUser);
  let date = new Date();

  const createTweetQuery = `INSERT INTO tweet (tweet,user_id,date_time)
 VALUES('${tweet}',${uid.user_id},'${date}');`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//delete user tweet
app.delete("/tweets/:tweetId/", AuthenticateJWT, async (request, response) => {
  let { tweetId } = request.params;
  const getUidOfUser = `SELECT user_id FROM user WHERE username='${request.username}';`;
  let uid = await db.get(getUidOfUser);

  const getUsrIdFromTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id=${parseInt(
    tweetId
  )};`;
  let userId = await db.get(getUsrIdFromTweetQuery);

  if (uid.user_id === userId.user_id) {
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
