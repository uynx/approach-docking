#include "game.hpp"
#include <iostream>
#include <stdexcept>
#include <vector>
namespace json=boost::json;
void require(bool ok,const char* message) { if(!ok) throw std::runtime_error(message); }
int main() {
    std::map<int,std::vector<json::value>> messages;
    Game game([&](int peer,const json::value& message){messages[peer].push_back(message);});
    game.receive(1,R"({"type":"create","name":"Pilot One"})");
    require(!messages[1].empty(),"create must return a room");
    const auto joined=messages[1].front().as_object();
    require(joined.at("type")=="joined","first message assigns pilot identity");
    const auto room=json::value_to<std::string>(joined.at("room"));
    game.receive(2,json::serialize(json::object{{"type","join"},{"room",room},{"name","Pilot Two"}}));
    require(messages[2].front().at("type")=="joined","second device joins same room");
    game.receive(3,json::serialize(json::object{{"type","join"},{"room",room},{"name","Extra"}}));
    require(messages[3].back().at("type")=="error","third pilot cannot overfill a room");
    game.receive(1,R"({"type":"ready"})");
    game.receive(2,R"({"type":"ready"})");
    for(int i=0;i<361;++i) game.tick();
    require(messages[1].back().at("phase")=="flight","both pilots start after a shared countdown");
    game.receive(1,R"({"type":"input","seq":1,"axes":[0,0,1,0,0,0]})");
    for(int i=0;i<12;++i) game.tick();
    const auto snapshot=messages[1].back().as_object();
    const double moving=snapshot.at("pilots").as_array()[0].at("state").as_array()[5].as_double();
    require(moving>0.01,"accepted thrust moves the authoritative ship");
    game.receive(1,R"({"type":"input","seq":1,"axes":[0,0,-1,0,0,0]})");
    require(messages[1].back().at("type")=="error","replayed sequence is rejected");
    game.receive(1,R"({"type":"input","seq":2,"axes":[0,0,1000,0,0,0]})");
    require(messages[1].back().at("type")=="error","excessive thrust is rejected");
    game.receive(1,R"({"type":"score","score":999999})");
    require(messages[1].back().at("type")=="error","client scores are rejected");
    game.receive(1,"{broken");
    require(messages[1].back().at("type")=="error","invalid JSON is rejected");
    const auto token=joined.at("token");
    game.disconnect(1);
    game.receive(4,json::serialize(json::object{{"type","resume"},{"room",room},{"token",token}}));
    require(messages[4].front().at("type")=="joined","disconnected pilot resumes with private token");
    game.receive(5,json::serialize(json::object{{"type","resume"},{"room",room},{"token","wrong"}}));
    require(messages[5].back().at("type")=="error","room code alone cannot take over a pilot");
    std::cout << "PASS rooms, countdown, authoritative input, validation, and reconnect\n";
    for(int frame=0;frame<18000;++frame) {
        for(int i=0;i<2;++i) {
            const int peer=i==0?4:2;
            const auto& latest=messages[peer].back();
            if(latest.at("type")!="state") continue;
            const auto& state=latest.at("pilots").as_array()[i].at("state").as_array();
            if(state[15].to_number<int>()!=0) continue;
            auto v=[&](int index){return state[index].to_number<double>();};
            const double speed=std::min(1.0,std::sqrt(std::max(0.0,-v(2))*0.05));
            auto axis=[](double acceleration){return std::clamp(acceleration/0.2,-1.0,1.0);};
            const json::array controls{axis(-0.1*v(0)-0.8*v(3)),axis(-0.1*v(1)-0.8*v(4)-0.002266*v(5)),
                axis(0.8*(speed-v(5))),0,0,0};
            game.receive(peer,json::serialize(json::object{{"type","input"},{"seq",frame+10},{"axes",controls}}));
        }
        for(int i=0;i<6;++i) game.tick();
        if(messages[4].back().at("phase")=="finished") break;
    }
    const auto final=messages[4].back();
    require(final.at("phase")=="finished","a complete game reaches its final result");
    for(const auto& pilot:final.at("pilots").as_array()) {
        const auto& s=pilot.at("state").as_array();
        std::cout << "Pilot result status=" << s[15] << " score=" << s[16] << " position=" << s[0] << ',' << s[1] << ',' << s[2] << " velocity=" << s[3] << ',' << s[4] << ',' << s[5] << '\n';
        require(s[15].to_number<int>()==1,"legitimate control sequence achieves docking");
        require(s[16].to_number<double>()>0 && s[16].to_number<double>()<=1000,"server computes bounded docking score");
    }
    game.receive(4,R"({"type":"ready"})"); game.receive(2,R"({"type":"ready"})");
    for(int i=0;i<366;++i) game.tick();
    require(messages[4].back().at("phase")=="flight","rematch starts after both players ready");
    require(messages[4].back().at("pilots").as_array()[0].at("state").as_array()[15].to_number<int>()==0,"rematch resets the previous result");
    std::cout << "PASS full two-pilot docking game, scores, and rematch\n";
    game.receive(6,R"({"type":"create","name":"Host"})");
    const auto replacement_room=messages[6].front().at("room");
    auto join=[&](int peer) {game.receive(peer,json::serialize(json::object{{"type","join"},{"room",replacement_room},{"name","Guest"}}));};
    join(7);
    game.receive(7,R"({"type":"leave"})");
    join(8);
    require(messages[8].front().at("type")=="joined","leaving the lobby frees a slot for a replacement");
    game.receive(6,R"({"type":"ready"})"); game.receive(8,R"({"type":"ready"})");
    for(int i=0;i<366;++i) game.tick();
    game.receive(8,R"({"type":"leave"})");
    require(messages[6].back().at("pilots").as_array()[1].at("state").as_array()[15].to_number<int>()==2,"leaving an active flight forfeits the attempt");
    game.receive(6,R"({"type":"leave"})");
    for(int i=0;i<6;++i) game.tick();
    game.receive(6,json::serialize(json::object{{"type","resume"},{"room",replacement_room},{"token",messages[6].front().at("token")}}));
    require(messages[6].back().at("type")=="error","leaving revokes the resume token");
    std::cout << "PASS leaving rooms and forfeiting flights\n";
}
