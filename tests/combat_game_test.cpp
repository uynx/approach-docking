#include "game.hpp"
#include <iostream>
#include <stdexcept>
#include <vector>

namespace json=boost::json;
void require(bool ok,const char* message) {if(!ok)throw std::runtime_error(message);}

int main() {
    std::map<int,std::vector<json::value>> messages;
    Game game([&](int peer,const json::value& message){messages[peer].push_back(message);});
    game.receive(1,R"({"type":"create","name":"Alice","mode":"combat","map":"shipyard"})");
    const auto code=messages[1].front().at("room");
    game.receive(2,json::serialize(json::object{{"type","join"},{"room",code},{"name","Bob"}}));
    require(messages[2].back().at("mode")=="combat","joining retains the host's combat mode");
    require(messages[2].back().at("combat").at("map")=="shipyard","both players receive the same map");
    game.receive(1,R"({"type":"ready"})");game.receive(2,R"({"type":"ready"})");
    for(int i=0;i<366;i++)game.tick();
    const auto& state=messages[1].back();
    require(state.at("phase")=="flight","combat starts after both pilots ready");
    require(state.at("combat").at("health").as_array()[0].to_number<double>()==100,"a combatant starts with full hull integrity");
    require(state.at("combat").at("round")==1,"the match begins in round one");
    std::cout<<"PASS two pilots share an authoritative combat arena and round\n";
    game.receive(1,R"({"type":"input","seq":1,"axes":[0,0,0,0,0,0],"fire":true})");
    for(int i=0;i<6;i++)game.tick();
    require(messages[2].back().at("combat").at("health").as_array()[1].to_number<double>()==75,"a server ray hit removes 25 hull points");
    for(int i=2;i<100;i++)game.receive(1,json::serialize(json::object{{"type","input"},{"seq",i},
        {"axes",json::array{0,0,0,0,0,0}},{"fire",true}}));
    for(int i=0;i<6;i++)game.tick();
    require(messages[2].back().at("combat").at("health").as_array()[1].to_number<double>()==75,"sending more inputs cannot bypass the weapon cooldown");
    const auto& enemy=messages[2].back().at("combat").at("fighters").as_array()[1];
    require(enemy.at("steering").to_number<double>()<1,"a nose hit degrades attitude thrusters");
    game.receive(1,R"({"type":"input","seq":100,"axes":[0,0,0,0,0,0],"fire":"yes"})");
    require(messages[1].back().at("type")=="error","malformed fire controls are rejected");
    game.receive(1,R"({"type":"damage","target":1,"amount":100})");
    require(messages[1].back().at("type")=="error","clients cannot submit damage claims");
    std::cout<<"PASS authoritative ray hits, cooldown enforcement and system damage\n";
}
